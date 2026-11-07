import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { regionCatalogSchema } from '#lib/neuron/schema';

import { requestRemote } from '../../../../skills/neuron404/scripts/transport.mjs';
import { DATA_DIR } from '../data-dir';
import { partialReferenceSchema } from './partial-references';
import { atomicWrite, fingerprint, withStorageLock } from './storage';
import { normalizeSyncRegions, type SyncFile } from './sync-scope';
import { readSyncFile, syncEntrySchema, syncManifest, writeSyncFile } from './sync-storage';

const manifestSchema = z.object({
    protocol: z.literal(2),
    regions: z.array(z.string()),
    entries: z.array(syncEntrySchema),
    next: z.number().int().nonnegative().nullable(),
});
const fileSchema = syncEntrySchema.extend({
    content: z.string(),
    partialReferences: partialReferenceSchema.optional(),
});
const stateSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));

export function parseSyncOptions(args: string[]) {
    let direction: 'both' | 'push' | 'pull' = 'both';
    let dryRun = false;
    const regions: string[] = [];
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--dry-run') {
            dryRun = true;
        } else if (argument === '--direction') {
            direction = z.enum(['both', 'push', 'pull']).parse(args[++index]);
        } else if (argument === '--region') {
            regions.push(z.string().parse(args[++index]));
        } else {
            throw new Error(`Invalid sync option: ${argument}`);
        }
    }
    return { direction, dryRun, regions: normalizeSyncRegions(regions) };
}

type SyncOptions = ReturnType<typeof parseSyncOptions>;
type FileAction = { path: string; action: 'push' | 'pull' | 'skip'; reason?: string };

async function remoteManifest(regions: string[]) {
    const remote = new Map<string, string>();
    let offset: number | null = 0;
    do {
        const page = manifestSchema.parse(
            await requestRemote('sync:manifest', [String(offset), ...regions]),
        );
        if (JSON.stringify(page.regions) !== JSON.stringify(regions)) {
            throw new Error('Invalid remote sync scope. Update both client and server.');
        }
        for (const entry of page.entries) {
            remote.set(entry.path, entry.revision);
        }
        if (page.next !== null && page.next <= offset) {
            throw new Error('Invalid remote manifest pagination.');
        }
        offset = page.next;
    } while (offset !== null);
    return remote;
}

async function remoteFile(name: string, revision: string | undefined, regions: string[]) {
    if (!revision) {
        return null;
    }
    const file = fileSchema.parse(await requestRemote('sync:read', [name, ...regions]));
    if (
        file.path !== name ||
        file.revision !== revision ||
        fingerprint(file.content) !== revision
    ) {
        throw new Error(`Sync conflict: remote changed during sync: ${name}`);
    }
    return file;
}

function transferContent(
    push: boolean,
    pull: boolean,
    local: SyncFile | null,
    remote: SyncFile | null,
) {
    if (push) {
        return local!.content;
    }
    if (pull) {
        return remote!.content;
    }
    return (
        [
            ...new Set(
                [...local!.content.split('\n'), ...remote!.content.split('\n')].filter(Boolean),
            ),
        ]
            .sort()
            .join('\n') + '\n'
    );
}

export async function synchronizeRemote(options: SyncOptions = parseSyncOptions([])) {
    if (!process.env.NEURON404_URL) {
        throw new Error('Set NEURON404_URL and NEURON404_TOKEN before syncing.');
    }
    const { direction, dryRun, regions } = options;
    const origin = new URL(process.env.NEURON404_URL).origin;
    const identity = regions.length ? JSON.stringify({ origin, regions }) : origin;
    const stateFile = path.join(DATA_DIR, 'sync', `${fingerprint(identity)}.json`);

    return withStorageLock(async () => {
        let baseline: z.infer<typeof stateSchema> = {};
        try {
            baseline = stateSchema.parse(JSON.parse(await readFile(stateFile, 'utf8')));
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw cause;
            }
        }
        const remote = await remoteManifest(regions);
        const local = new Map(
            (await syncManifest(0, Infinity, regions)).map((file) => [file.path, file.revision]),
        );
        if (regions.length) {
            const catalogs = [
                await readSyncFile('regions.json', regions),
                await remoteFile('regions.json', remote.get('regions.json'), regions),
            ];
            const known = new Set(
                catalogs.flatMap((file) =>
                    file
                        ? regionCatalogSchema
                              .parse(JSON.parse(file.content))
                              .regions.map((region) => region.id)
                        : [],
                ),
            );
            const missing = regions.filter((region) => !known.has(region));
            if (missing.length) {
                throw new Error(`Unknown sync Regions: ${missing.join(', ')}`);
            }
        }
        const report = {
            direction,
            regions,
            dryRun,
            pushed: 0,
            pulled: 0,
            unchanged: 0,
            skipped: 0,
            files: [] as FileAction[],
            conflicts: [] as string[],
        };
        const paths = [
            ...new Set([...remote.keys(), ...local.keys(), ...Object.keys(baseline)]),
        ].sort();
        try {
            for (const name of paths) {
                const here = local.get(name);
                const there = remote.get(name);
                const previous = baseline[name];
                if (here === there) {
                    if (here) {
                        baseline[name] = here;
                    }
                    report.unchanged++;
                    continue;
                }
                if ((!here || !there) && previous) {
                    report.conflicts.push(name);
                    continue;
                }
                const push = !there || Boolean(here && there === previous);
                const pull = !here || Boolean(there && here === previous);
                if (!push && !pull && name !== 'operations.jsonl') {
                    report.conflicts.push(name);
                    continue;
                }
                if ((push && direction === 'pull') || (pull && direction === 'push')) {
                    report.skipped++;
                    report.files.push({
                        path: name,
                        action: 'skip',
                        reason: 'The required transfer is outside the selected direction.',
                    });
                    continue;
                }
                const localFile = await readSyncFile(name, regions);
                const received = await remoteFile(name, there, regions);
                if ((localFile?.revision ?? undefined) !== here) {
                    throw new Error(`Sync conflict: local changed during sync: ${name}`);
                }
                const content = transferContent(push, pull, localFile, received);
                const revision = fingerprint(content);
                const partialReferences = push
                    ? localFile?.partialReferences
                    : received?.partialReferences;
                let afterLocal = here;
                let afterRemote = there;
                if (there !== revision && direction !== 'pull') {
                    if (!dryRun) {
                        const saved = syncEntrySchema.parse(
                            await requestRemote(
                                'sync:write',
                                [],
                                {
                                    path: name,
                                    expectedRevision: there ?? null,
                                    content,
                                    regions,
                                    partialReferences,
                                },
                                randomUUID(),
                            ),
                        );
                        if (saved.path !== name || saved.revision !== revision) {
                            throw new Error(`Sync conflict: unexpected write result: ${name}`);
                        }
                    }
                    report.pushed++;
                    report.files.push({ path: name, action: 'push' });
                    afterRemote = revision;
                }
                if (here !== revision && direction !== 'push') {
                    if (!dryRun) {
                        await writeSyncFile(
                            {
                                path: name,
                                expectedRevision: here ?? null,
                                content,
                                regions,
                                partialReferences,
                            },
                            true,
                        );
                    }
                    report.pulled++;
                    report.files.push({ path: name, action: 'pull' });
                    afterLocal = revision;
                }
                if (afterLocal === afterRemote && afterLocal) {
                    baseline[name] = afterLocal;
                }
            }
        } finally {
            if (!dryRun) {
                await atomicWrite(stateFile, JSON.stringify(baseline, null, 2) + '\n');
            }
        }
        return report;
    });
}
