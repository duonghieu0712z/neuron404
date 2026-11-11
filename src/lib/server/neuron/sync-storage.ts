import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { recordPartialReferences } from './partial-references';
import { atomicWrite, CONTENT_DIR, fingerprint, markIndexDirty, withStorageLock } from './storage';
import {
    checkedPath,
    readRawSyncFile,
    readSyncFile,
    scopedNeuronIds,
    syncPath,
} from './sync-files';
import { mergeSyncFile, normalizeSyncRegions, projectSyncFile } from './sync-scope';
import { validateContent, writeSchema } from './sync-validation';

export { readSyncFile, syncPath } from './sync-files';

export { syncManifest } from './sync-manifest';

export { syncEntrySchema } from './sync-validation';

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
