import type { Db } from '#lib/server/db/client';

import { sql } from 'drizzle-orm';

import { neurons, synapses } from '#lib/server/db/schema';

import { readAllNeurons } from './store';

export interface IndexResult {
    neuronCount: number;
    synapseCount: number;
}

export async function rebuildIndex(db: Db): Promise<IndexResult> {
    const allNeurons = await readAllNeurons();

    await db.transaction(async (tx) => {
        await tx.run(
            sql`CREATE VIRTUAL TABLE IF NOT EXISTS neurons_fts USING fts5(id UNINDEXED, title, body)`,
        );
        await tx.run(sql`DELETE FROM neurons_fts`);
        await tx.delete(synapses);
        await tx.delete(neurons);

        for (const neuron of allNeurons) {
            await tx.run(
                sql`INSERT INTO neurons_fts (id, title, body) VALUES (${neuron.id}, ${neuron.title}, ${neuron.body})`,
            );
        }

        for (const neuron of allNeurons) {
            await tx.insert(neurons).values({
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
            });
        }

        for (const neuron of allNeurons) {
            for (const synapse of neuron.synapses) {
                await tx.insert(synapses).values({
                    sourceNeuronId: neuron.id,
                    targetNeuronId: synapse.target,
                    kind: synapse.kind,
                    note: synapse.note,
                });
            }
        }
    });

    return {
        neuronCount: allNeurons.length,
        synapseCount: allNeurons.reduce((sum, neuron) => sum + neuron.synapses.length, 0),
    };
}
