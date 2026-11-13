import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { regionCatalogSchema } from '#lib/neuron/schema';

import { requestRemote } from '../../../../skills/neuron404/scripts/transport.mjs';
import { DATA_DIR } from '../data-dir';
import { atomicWrite, fingerprint, withStorageLock } from './storage';
import { readSyncFile, syncEntrySchema, syncManifest, writeSyncFile } from './sync-storage';
import {
    parseSyncOptions,
    remoteFile,
    remoteManifest,
    stateSchema,
    transferContent,
    type FileAction,
    type SyncOptions,
} from './sync-transport';

export { parseSyncOptions } from './sync-transport';

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
