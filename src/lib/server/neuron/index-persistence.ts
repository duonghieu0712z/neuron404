import type { Neuron } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { count, eq, sql } from 'drizzle-orm';

import { neuronIndexState, neurons, synapses } from '#lib/server/db/schema';

interface IndexedSnapshot {
    neuron: Neuron;
    revision: string;
    stamp: string;
}

interface IndexChanges {
    removed: { id: string }[];
    changed: IndexedSnapshot[];
    parsed: IndexedSnapshot[];
    ids: Set<string>;
    recreateFts: boolean;
    checkpoint: {
        id: string;
        checkedAt: number;
        directoryStamp: string;
        catalogStamp: string;
        neuronCount: number;
    };
}

export async function persistIndexChanges(db: Db, changes: IndexChanges) {
    const { removed, changed, parsed, ids, recreateFts, checkpoint } = changes;
    let synapseCount = 0;
    await db.transaction(async (tx) => {
        if (recreateFts) {
            await tx.run(sql`DROP TABLE IF EXISTS neurons_fts`);
        }

        await tx.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS neurons_fts USING fts5(
            id UNINDEXED, title, body, aliases, retrieval_cues,
            tokenize='unicode61 remove_diacritics 2'
        )`);

        for (const row of removed) {
            await tx.delete(synapses).where(eq(synapses.sourceNeuronId, row.id));
            await tx.delete(synapses).where(eq(synapses.targetNeuronId, row.id));
            await tx.run(sql`DELETE FROM neurons_fts WHERE id = ${row.id}`);
            await tx.delete(neurons).where(eq(neurons.id, row.id));
        }

        for (const { neuron, revision, stamp } of changed) {
            const values = {
                id: neuron.id,
                title: neuron.title,
                status: neuron.status,
                grounding: neuron.grounding,
                endorsement: neuron.endorsement,
                provenance: neuron.provenance,
                body: neuron.body,
                filePath: `${neuron.id}.md`,
                createdAt: neuron.created,
                updatedAt: neuron.updated,
                aliases: neuron.aliases,
                retrievalCues: neuron.retrievalCues,
                regions: neuron.regions,
                sources: neuron.sources,
                lifecycle: neuron.lifecycle,
                supersededBy: neuron.supersededBy ?? null,
                revision,
                fileStamp: stamp,
            };
            await tx
                .insert(neurons)
                .values(values)
                .onConflictDoUpdate({ target: neurons.id, set: values });
            await tx.run(sql`DELETE FROM neurons_fts WHERE id = ${neuron.id}`);
            await tx.run(sql`INSERT INTO neurons_fts (id, title, body, aliases, retrieval_cues)
                VALUES (${neuron.id}, ${neuron.title}, ${neuron.body}, ${neuron.aliases.join(' ')}, ${neuron.retrievalCues.join(' ')})`);
        }

        for (const { neuron } of changed) {
            const stored = await tx
                .select()
                .from(synapses)
                .where(eq(synapses.sourceNeuronId, neuron.id))
                .orderBy(synapses.id);

            const remaining = new Set(stored.map((edge) => edge.id));
            const byRelation = new Map<string, typeof stored>();

            for (const edge of stored) {
                const key = JSON.stringify([edge.targetNeuronId, edge.kind]);
                const group = byRelation.get(key) ?? [];
                group.push(edge);
                byRelation.set(key, group);
            }

            for (const edge of neuron.synapses) {
                if (!ids.has(edge.target)) {
                    continue;
                }

                const saved = byRelation.get(JSON.stringify([edge.target, edge.kind]))?.shift();

                if (saved) {
                    remaining.delete(saved.id);

                    if (saved.note !== (edge.note ?? null)) {
                        await tx
                            .update(synapses)
                            .set({ note: edge.note ?? null })
                            .where(eq(synapses.id, saved.id));
                    }
                } else {
                    await tx.insert(synapses).values({
                        sourceNeuronId: neuron.id,
                        targetNeuronId: edge.target,
                        kind: edge.kind,
                        note: edge.note,
                    });
                }
            }

            for (const id of remaining) {
                await tx.delete(synapses).where(eq(synapses.id, id));
            }
        }

        const changedIds = new Set(changed.map(({ neuron }) => neuron.id));

        for (const { neuron, stamp } of parsed) {
            if (!changedIds.has(neuron.id)) {
                await tx.update(neurons).set({ fileStamp: stamp }).where(eq(neurons.id, neuron.id));
            }
        }

        [{ synapseCount }] = await tx.select({ synapseCount: count() }).from(synapses);
        const next = { ...checkpoint, synapseCount };
        await tx
            .insert(neuronIndexState)
            .values(next)
            .onConflictDoUpdate({ target: neuronIndexState.id, set: next });
    });
    return synapseCount;
}
