import { sql } from 'drizzle-orm';

import { SYNAPSE_KINDS } from '#lib/neuron/schema';

import { readIndexedNeuron, withIndexedStore } from './indexed-store';
import { safeId } from './storage';

export async function readNeighbors(
    id: string,
    options: {
        limit?: number;
        offset?: number;
        kind?: string;
        direction?: string;
    } = {},
) {
    safeId(id);
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const direction = options.direction ?? 'both';

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isInteger(offset) ||
        offset < 0
    ) {
        throw new Error('Neighbors requires limit 1-50 and a nonnegative integer offset');
    }

    if (!['both', 'incoming', 'outgoing'].includes(direction)) {
        throw new Error('Unknown direction');
    }

    if (options.kind && !SYNAPSE_KINDS.some((kind) => kind === options.kind)) {
        throw new Error('Unknown synapse kind');
    }

    return withIndexedStore(async (db) => {
        await readIndexedNeuron(db, id);
        const edges = sql`
            SELECT target_neuron_id AS neighbor, kind, note, 'outgoing' AS direction FROM synapses
            WHERE source_neuron_id = ${id} AND ${direction !== 'incoming'}
            UNION ALL
            SELECT source_neuron_id AS neighbor, kind, note, 'incoming' AS direction FROM synapses
            WHERE target_neuron_id = ${id} AND ${direction !== 'outgoing'}
        `;

        const filter = options.kind ? sql`WHERE e.kind = ${options.kind}` : sql``;
        const totals = await db.run(sql`SELECT COUNT(*) AS total FROM (${edges}) AS e ${filter}`);

        const rows =
            await db.run(sql`SELECT n.id, n.title, n.revision, n.lifecycle, n.retrieval_cues, e.kind, e.note, e.direction
            FROM (${edges}) AS e JOIN neurons AS n ON n.id = e.neighbor ${filter}
            ORDER BY e.direction, e.kind, n.id LIMIT ${limit} OFFSET ${offset}`);

        const total = Number(totals.rows[0].total);

        return {
            id,
            total,
            limit,
            offset,
            nextOffset: offset + rows.rows.length < total ? offset + rows.rows.length : null,
            neighbors: rows.rows.map(({ retrieval_cues, ...row }) => ({
                ...row,
                retrievalCues: JSON.parse(String(retrieval_cues)) as string[],
            })),
        };
    });
}
