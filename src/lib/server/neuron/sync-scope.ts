import matter from '@11ty/gray-matter';
import { z } from 'zod';

import { neuronFrontmatterSchema, regionIdSchema } from '#lib/neuron/schema';

import { fingerprint } from './storage';

export interface SyncFile {
    path: string;
    content: string;
    revision: string;
}
export type SyncReader = (name: string) => Promise<SyncFile | null>;
export const syncRegionsSchema = z.array(regionIdSchema).max(100).default([]);

export function normalizeSyncRegions(input: unknown) {
    return [...new Set(syncRegionsSchema.parse(input))].sort();
}

function belongsTo(regions: string[], selected: string[]) {
    return regions.some((region) => selected.includes(region));
}

export async function selectSyncPaths(names: string[], regions: string[], read: SyncReader) {
    if (!regions.length) {
        return names;
    }
    const selected = new Set<string>();
    const neuronIds = new Set<string>();
    const sources = new Set<string>();
    const addNeuron = (file: SyncFile, current: boolean) => {
        const parsed = matter(file.content, {});
        if (!belongsTo(z.array(z.string()).parse(parsed.data.regions ?? []), regions)) {
            return;
        }
        const neuron = neuronFrontmatterSchema.parse(parsed.data);
        selected.add(file.path);
        if (current) {
            neuronIds.add(neuron.id);
        }
        for (const source of neuron.sources) {
            sources.add(`sources/${source}.json`);
        }
    };
    for (const name of names.filter((name) => name.startsWith('neurons/'))) {
        const file = await read(name);
        if (file) {
            addNeuron(file, true);
        }
    }
    for (const name of names) {
        const segments = name.split('/');
        if (segments[0] === 'history' && neuronIds.has(segments[1])) {
            const file = await read(name);
            if (file) {
                addNeuron(file, false);
            }
        }
        if (
            (segments[0] === 'regions' && regions.includes(segments[1].replace(/\.md$/, ''))) ||
            (segments[0] === 'history' &&
                segments[1] === 'region-overviews' &&
                regions.includes(segments[2]))
        ) {
            selected.add(name);
        }
    }
    for (const name of ['regions.json', 'operations.jsonl', ...sources]) {
        if (names.includes(name)) {
            selected.add(name);
        }
    }
    return [...selected];
}

export async function projectSyncFile(
    file: SyncFile | null,
    regions: string[],
    neuronIds: () => Promise<Set<string>>,
) {
    if (!file || !regions.length) {
        return file;
    }
    let content = file.content;
    if (file.path === 'regions.json') {
        const document = JSON.parse(content);
        const entries = z
            .array(z.object({ id: z.string() }).passthrough())
            .parse(document.regions)
            .filter((entry) => regions.includes(entry.id))
            .sort((a, b) => a.id.localeCompare(b.id));
        if (!entries.length) {
            return null;
        }
        content = JSON.stringify({ regions: entries }, null, 4) + '\n';
    } else if (file.path === 'operations.jsonl') {
        const ids = await neuronIds();
        const lines = content
            .split('\n')
            .filter(Boolean)
            .filter((line) => ids.has(JSON.parse(line).id));
        if (!lines.length) {
            return null;
        }
        content = [...new Set(lines)].sort().join('\n') + '\n';
    }
    return { ...file, content, revision: fingerprint(content) };
}

export function mergeSyncFile(existing: SyncFile | null, incoming: SyncFile, regions: string[]) {
    if (!regions.length) {
        return incoming.content;
    }
    if (incoming.path === 'regions.json') {
        const document = existing ? JSON.parse(existing.content) : { regions: [] };
        const additions = z
            .array(z.object({ id: z.string() }).passthrough())
            .parse(JSON.parse(incoming.content).regions);
        if (additions.some((entry) => !regions.includes(entry.id))) {
            throw new Error('Invalid Region outside sync scope.');
        }
        const retained = z
            .array(z.object({ id: z.string() }).passthrough())
            .parse(document.regions);
        for (const entry of retained.filter((entry) => regions.includes(entry.id))) {
            if (!additions.some((addition) => addition.id === entry.id)) {
                throw new Error('Sync conflict: Region deletion is not propagated.');
            }
        }
        return (
            JSON.stringify(
                {
                    ...document,
                    regions: [
                        ...retained.filter((entry) => !regions.includes(entry.id)),
                        ...additions,
                    ],
                },
                null,
                4,
            ) + '\n'
        );
    }
    if (incoming.path === 'operations.jsonl') {
        return (
            [
                ...new Set(
                    [
                        ...(existing?.content ?? '').split('\n'),
                        ...incoming.content.split('\n'),
                    ].filter(Boolean),
                ),
            ].join('\n') + '\n'
        );
    }
    return incoming.content;
}
