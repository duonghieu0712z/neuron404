import type { Db } from '#lib/server/db/client';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { createDb } from '#lib/server/db/client';
import { neurons } from '#lib/server/db/schema';

import { INDEX_RECHECK_MS, synchronizeIndexUnlocked } from './indexer';
import { withStorageLock } from './storage';
import { readNeuronSnapshot } from './store';

export interface IndexSnapshot {
    neuron: { id: string; title: string; regions: string[]; lifecycle: string };
    revision: string;
}

export async function withIndexedStore<T>(action: (db: Db) => Promise<T>) {
    const db = createDb();
    try {
        return await withStorageLock(async () => {
            await synchronizeIndexUnlocked(db, false, INDEX_RECHECK_MS);
            return action(db);
        });
    } finally {
        db.$client.close();
    }
}

export async function readIndexSnapshots(db: Db, scope: { region?: string; ids?: string[] }) {
    if (scope.ids?.length === 0) {
        return [];
    }
    const rows = await db
        .select({
            id: neurons.id,
            title: neurons.title,
            regions: neurons.regions,
            lifecycle: neurons.lifecycle,
            revision: neurons.revision,
        })
        .from(neurons)
        .where(
            scope.ids
                ? inArray(neurons.id, scope.ids)
                : and(
                      sql`EXISTS (SELECT 1 FROM json_each(${neurons.regions}) WHERE value = ${scope.region})`,
                      eq(neurons.lifecycle, 'active'),
                  ),
        );
    return rows.map(({ revision, ...neuron }) => ({ neuron, revision }));
}

export async function readIndexedNeuron(db: Db, id: string) {
    let snapshot = await readNeuronSnapshot(id);
    const indexed = await db
        .select({ revision: neurons.revision })
        .from(neurons)
        .where(eq(neurons.id, id));
    if (indexed[0]?.revision !== snapshot.revision) {
        await synchronizeIndexUnlocked(db);
        snapshot = await readNeuronSnapshot(id);
        const current = await db
            .select({ revision: neurons.revision })
            .from(neurons)
            .where(eq(neurons.id, id));
        if (current[0]?.revision !== snapshot.revision) {
            throw new Error(`Neuron ${id} changed during retrieval. Retry the query.`);
        }
    }
    return snapshot;
}
