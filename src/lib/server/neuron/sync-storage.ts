import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import {
    neuronFrontmatterSchema,
    regionCatalogSchema,
    sourceInputSchema,
} from '#lib/neuron/schema';

import {
    partialReferenceSchema,
    readPartialReferences,
    recordPartialReferences,
} from './partial-references';
import { atomicWrite, CONTENT_DIR, fingerprint, markIndexDirty, withStorageLock } from './storage';
import {
    mergeSyncFile,
    normalizeSyncRegions,
    projectSyncFile,
    selectSyncPaths,
    syncRegionsSchema,
} from './sync-scope';

const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const syncEntrySchema = z.object({ path: z.string(), revision });
const writeSchema = z.object({
    path: z.string(),
    expectedRevision: revision.nullable(),
    content: z.string(),
    regions: syncRegionsSchema,
    partialReferences: partialReferenceSchema.optional(),
});

export function syncPath(relative: string) {
    const id = '[a-zA-Z0-9][a-zA-Z0-9_-]*';
    const hash = '[a-f0-9]{64}';
    const pattern = new RegExp(
        `^(regions\\.json|operations\\.jsonl|neurons/${id}\\.md|regions/${id}\\.md|sources/${hash}\\.json|history/${id}/${hash}\\.md|history/regions/${hash}\\.json|history/region-overviews/${id}/${hash}\\.md)$`,
    );
    if (!pattern.test(relative)) {
        throw new Error('Invalid sync path.');
    }
    return path.join(CONTENT_DIR, ...relative.split('/'));
}

async function checkedPath(relative: string) {
    const target = syncPath(relative);
    let current = CONTENT_DIR;
    for (const part of ['', ...relative.split('/')]) {
        current = path.join(current, part);
        try {
            const stat = await lstat(current);
            if (stat.isSymbolicLink()) {
                throw new Error('Invalid symbolic link in sync storage.');
            }
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw cause;
            }
        }
    }
    return target;
}

async function readRawSyncFile(relative: string) {
    const file = await checkedPath(relative);
    try {
        const content = await readFile(file, 'utf8');
        return { path: relative, content, revision: fingerprint(content) };
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw cause;
    }
}

async function scopedNeuronIds(regions: string[]) {
    let files: string[];
    try {
        files = await readdir(path.join(CONTENT_DIR, 'neurons'));
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Set<string>();
        }
        throw cause;
    }
    const ids = new Set<string>();
    for (const name of files.filter((name) => name.endsWith('.md'))) {
        const file = await readRawSyncFile(`neurons/${name}`);
        if (file) {
            const data = neuronFrontmatterSchema.parse(matter(file.content, {}).data);
            if (data.regions.some((region) => regions.includes(region))) {
                ids.add(data.id);
            }
        }
    }
    return ids;
}

export async function readSyncFile(relative: string, regions: string[] = []) {
    const file = await projectSyncFile(await readRawSyncFile(relative), regions, () =>
        scopedNeuronIds(regions),
    );
    if (file && relative.startsWith('neurons/')) {
        const references = await readPartialReferences();
        return { ...file, partialReferences: references[relative.slice(8, -3)] };
    }
    return file ? { ...file, partialReferences: undefined } : null;
}

export async function syncManifest(offset = 0, limit = Infinity, regions: string[] = []) {
    const names: string[] = [];
    async function visit(relative: string) {
        let children;
        try {
            children = await readdir(path.join(CONTENT_DIR, relative), { withFileTypes: true });
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }
            throw cause;
        }
        for (const child of children) {
            const name = relative ? `${relative}/${child.name}` : child.name;
            if (child.isSymbolicLink()) {
                throw new Error('Invalid symbolic link in sync storage.');
            }
            if (child.isDirectory()) {
                if (/^(neurons|regions|sources|history)(\/|$)/.test(name)) {
                    await visit(name);
                }
            } else {
                try {
                    syncPath(name);
                } catch {
                    continue;
                }
                names.push(name);
            }
        }
    }
    await visit('');
    const scoped = await selectSyncPaths(names, regions, readRawSyncFile);
    const projected = new Map<string, Awaited<ReturnType<typeof readSyncFile>>>();
    for (const name of ['regions.json', 'operations.jsonl']) {
        if (scoped.includes(name)) {
            projected.set(name, await readSyncFile(name, regions));
        }
    }
    const visible = scoped.filter((name) => !projected.has(name) || projected.get(name));
    const entries: z.infer<typeof syncEntrySchema>[] = [];
    for (const name of visible.sort().slice(offset, offset + limit)) {
        const file = projected.has(name) ? projected.get(name) : await readSyncFile(name, regions);
        if (file) {
            entries.push({ path: name, revision: file.revision });
        }
    }
    return entries;
}

function validateContent(relative: string, content: string) {
    if (relative.startsWith('history/')) {
        if (path.basename(relative).split('.')[0] !== fingerprint(content)) {
            throw new Error('Invalid history integrity in sync file.');
        }
        return;
    }
    if (relative.startsWith('neurons/')) {
        const parsed = neuronFrontmatterSchema.parse(matter(content, {}).data);
        if (relative !== `neurons/${parsed.id}.md`) {
            throw new Error('Invalid neuron ID in sync file.');
        }
    } else if (relative === 'regions.json') {
        regionCatalogSchema.parse(JSON.parse(content));
    } else if (relative.startsWith('sources/')) {
        const stored = JSON.parse(content);
        const source = sourceInputSchema.parse(stored.source);
        if (relative !== `sources/${fingerprint(JSON.stringify(source))}.json`) {
            throw new Error('Invalid source integrity in sync file.');
        }
    } else if (relative === 'operations.jsonl') {
        for (const line of content.split('\n').filter(Boolean)) {
            z.object({
                operation: z.enum(['create', 'update']),
                id: z.string(),
                revision,
                at: z.string(),
            }).parse(JSON.parse(line));
        }
    } else {
        const parsed = matter(content, {}).data;
        z.object({
            region: z.string(),
            updated: z.string(),
            members: z.record(z.string(), revision),
        }).parse(parsed);
    }
}

export async function writeSyncFile(input: unknown, locked = false) {
    const change = writeSchema.parse(input);
    const regions = normalizeSyncRegions(change.regions);
    syncPath(change.path);
    validateContent(change.path, change.content);
    const action = async () => {
        const destination = await checkedPath(change.path);
        const rawExisting = await readRawSyncFile(change.path);
        const existing = await readSyncFile(change.path, regions);
        const next = fingerprint(change.content);
        if (existing?.revision === next) {
            return { path: change.path, revision: next };
        }
        if ((existing?.revision ?? null) !== change.expectedRevision) {
            throw new Error(`Sync conflict: ${change.path}`);
        }
        if (existing && /^(history|sources)\//.test(change.path)) {
            throw new Error(`Sync conflict: immutable file ${change.path}`);
        }
        const merged = mergeSyncFile(
            rawExisting,
            { path: change.path, revision: next, content: change.content },
            regions,
        );
        const projected = await projectSyncFile(
            { path: change.path, content: merged, revision: fingerprint(merged) },
            regions,
            () => scopedNeuronIds(regions),
        );
        if (projected?.revision !== next) {
            throw new Error(`Sync conflict: scoped content changed: ${change.path}`);
        }
        if (rawExisting) {
            await atomicWrite(
                path.join(CONTENT_DIR, 'sync-backups', change.path, rawExisting.revision),
                rawExisting.content,
                true,
            );
        }
        if ((regions.length || change.partialReferences) && change.path.startsWith('neurons/')) {
            const neuron = neuronFrontmatterSchema.parse(matter(change.content, {}).data);
            await recordPartialReferences(
                neuron.id,
                [
                    ...neuron.synapses.map((edge) => edge.target),
                    ...(neuron.supersededBy ? [neuron.supersededBy] : []),
                ],
                neuron.regions.filter((region) =>
                    regions.length
                        ? !regions.includes(region)
                        : change.partialReferences?.regions.includes(region),
                ),
            );
        }
        await atomicWrite(destination, merged, /^(sources|history)\//.test(change.path));
        if ((await readSyncFile(change.path, regions))?.revision !== next) {
            throw new Error(`Sync conflict: ${change.path}`);
        }
        await markIndexDirty();
        return { path: change.path, revision: next };
    };
    return locked ? action() : withStorageLock(action);
}
