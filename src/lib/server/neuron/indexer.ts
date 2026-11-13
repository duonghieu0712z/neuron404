import type { Db } from '#lib/server/db/client';

import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { eq, inArray, sql } from 'drizzle-orm';

import { neuronIndexState, neurons, synapses } from '#lib/server/db/schema';

import { persistIndexChanges } from './index-persistence';
import { readPartialReferences, writePartialReferences } from './partial-references';
import { readRegions } from './regions';
import { readSource } from './sources';
import { CONTENT_DIR, withStorageLock } from './storage';
import { listNeuronFiles, NEURONS_DIR, readNeuronSnapshot } from './store';

export const INDEX_RECHECK_MS = 30_000;
const STATE_ID = `retrieval-v1:${CONTENT_DIR}`;

async function fileStamp(file: string) {
    try {
        const value = await stat(file, { bigint: true });
        return `${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return '';
        }

        throw error;
    }
}

async function mapFiles<T, R>(items: T[], action: (item: T) => Promise<R>): Promise<R[]> {
    const result = new Array<R>(items.length);
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(16, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                result[index] = await action(items[index]);
            }
        }),
    );
    return result;
}

export async function synchronizeIndexUnlocked(db: Db, force = false, maxAgeMs = 0) {
    const startedAt = Date.now();

    const [directoryStamp, catalogStamp, dirtyStamp, state] = await Promise.all([
        fileStamp(NEURONS_DIR),
        fileStamp(path.join(CONTENT_DIR, 'regions.json')),
        fileStamp(path.join(CONTENT_DIR, '.index-dirty')),
        db.select().from(neuronIndexState).where(eq(neuronIndexState.id, STATE_ID)),
    ]);

    const checkpoint = state[0];

    if (
        !force &&
        !dirtyStamp &&
        checkpoint &&
        checkpoint.directoryStamp === directoryStamp &&
        checkpoint.catalogStamp === catalogStamp &&
        startedAt >= checkpoint.checkedAt &&
        startedAt - checkpoint.checkedAt < maxAgeMs
    ) {
        return {
            neuronCount: checkpoint.neuronCount,
            synapseCount: checkpoint.synapseCount,
            updated: 0,
            removed: 0,
            checkedFiles: 0,
            parsedFiles: 0,
            cached: true,
        };
    }

    const existing = await db
        .select({
            id: neurons.id,
            revision: neurons.revision,
            fileStamp: neurons.fileStamp,
            regions: neurons.regions,
            lifecycle: neurons.lifecycle,
            supersededBy: neurons.supersededBy,
        })
        .from(neurons);

    const previous = new Map(existing.map((row) => [row.id, row]));
    const fts = await db.run(sql`PRAGMA table_info(neurons_fts)`);
    const recreateFts = !fts.rows.some((row) => row.name === 'retrieval_cues');

    const files = await mapFiles(await listNeuronFiles(), async (name) => ({
        id: name.slice(0, -3),
        stamp: await fileStamp(path.join(NEURONS_DIR, name)),
    }));

    const partial = await readPartialReferences();
    const previousPartial = JSON.stringify(partial);
    const hasAdditions = files.some((file) => !previous.has(file.id));

    const parsed = await mapFiles(
        files.filter(
            (file) =>
                force ||
                recreateFts ||
                (hasAdditions && Boolean(partial[file.id])) ||
                previous.get(file.id)?.fileStamp !== file.stamp,
        ),
        async (file) => {
            const snapshot = await readNeuronSnapshot(file.id);

            if (file.stamp !== (await fileStamp(path.join(NEURONS_DIR, `${file.id}.md`)))) {
                throw new Error(`Neuron ${file.id} changed during indexing. Retry the query.`);
            }

            return { ...snapshot, stamp: file.stamp };
        },
    );

    const fileIds = new Set(files.map((file) => file.id));
    const removed = existing.filter((row) => !fileIds.has(row.id));
    const byId = new Map(existing.filter((row) => fileIds.has(row.id)).map((row) => [row.id, row]));

    for (const { neuron, revision, stamp } of parsed) {
        byId.set(neuron.id, {
            ...neuron,
            supersededBy: neuron.supersededBy ?? null,
            revision,
            fileStamp: stamp,
        });
    }

    const regionIds = new Set((await readRegions()).map((region) => region.id));

    for (const neuron of byId.values()) {
        for (const id of neuron.regions) {
            if (!regionIds.has(id) && !partial[neuron.id]?.regions.includes(id)) {
                throw new Error(`Unknown region "${id}" on neuron ${neuron.id}`);
            }
        }

        if ((neuron.lifecycle === 'superseded') !== Boolean(neuron.supersededBy)) {
            throw new Error(`Invalid replacement state on neuron ${neuron.id}`);
        }

        const visited = new Set([neuron.id]);
        let owner = neuron.id;
        let replacement = neuron.supersededBy;

        while (replacement) {
            if (visited.has(replacement)) {
                throw new Error('Supersession cycle');
            }

            visited.add(replacement);
            const target = byId.get(replacement);

            if (!target) {
                if (partial[owner]?.neurons.includes(replacement)) {
                    break;
                }

                throw new Error(`Unknown replacement: ${replacement}`);
            }

            owner = target.id;
            replacement = target.supersededBy;
        }
    }

    for (const { neuron } of parsed) {
        for (const edge of neuron.synapses) {
            if (!byId.has(edge.target) && !partial[neuron.id]?.neurons.includes(edge.target)) {
                throw new Error(`Unknown synapse target: ${edge.target}`);
            }
        }
    }

    if (removed.length) {
        const reparsed = new Set(parsed.map(({ neuron }) => neuron.id));

        const incoming = await db
            .select()
            .from(synapses)
            .where(
                inArray(
                    synapses.targetNeuronId,
                    removed.map((row) => row.id),
                ),
            );

        for (const edge of incoming) {
            if (
                byId.has(edge.sourceNeuronId) &&
                !reparsed.has(edge.sourceNeuronId) &&
                !partial[edge.sourceNeuronId]?.neurons.includes(edge.targetNeuronId)
            ) {
                throw new Error(`Unknown synapse target: ${edge.targetNeuronId}`);
            }
        }
    }

    await mapFiles([...new Set(parsed.flatMap(({ neuron }) => neuron.sources))], readSource);
    const changed = parsed.filter(
        ({ neuron, revision }) =>
            force ||
            recreateFts ||
            (hasAdditions && Boolean(partial[neuron.id])) ||
            previous.get(neuron.id)?.revision !== revision,
    );

    const synapseCount = await persistIndexChanges(db, {
        removed,
        changed,
        parsed,
        ids: new Set(byId.keys()),
        recreateFts,
        checkpoint: {
            id: STATE_ID,
            checkedAt: startedAt,
            directoryStamp,
            catalogStamp,
            neuronCount: files.length,
        },
    });

    for (const [id, references] of Object.entries(partial)) {
        references.neurons = references.neurons.filter((target) => !byId.has(target));
        references.regions = references.regions.filter((region) => !regionIds.has(region));

        if (!byId.has(id) || (!references.neurons.length && !references.regions.length)) {
            delete partial[id];
        }
    }

    if (JSON.stringify(partial) !== previousPartial) {
        await writePartialReferences(partial);
    }

    await rm(path.join(CONTENT_DIR, '.index-dirty'), { force: true });

    return {
        neuronCount: files.length,
        synapseCount,
        updated: changed.length,
        removed: removed.length,
        checkedFiles: files.length,
        parsedFiles: parsed.length,
        cached: false,
    };
}

export async function rebuildIndex(db: Db) {
    return withStorageLock(() => synchronizeIndexUnlocked(db, true));
}

export async function synchronizeIndex(db: Db) {
    return withStorageLock(() => synchronizeIndexUnlocked(db));
}

export async function ensureIndex(db: Db) {
    return withStorageLock(() => synchronizeIndexUnlocked(db, false, INDEX_RECHECK_MS));
}
