import type { Db } from '#lib/server/db/client';

import { sql } from 'drizzle-orm';

const STOP_WORDS = new Set(
    'a an the is are was were to of for in on and or what how why can do does i my we you me about la co cua va voi cho mot nhung cac thi ma nay do o tu toi khi gi nao sao nhu the duoc khong hay ve xin hay'.split(
        ' ',
    ),
);

function fold(text: string) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export interface SearchOptions {
    topic?: string;
    includeHistory?: boolean;
}

export async function searchNeurons(
    db: Db,
    query: string,
    limit = 10,
    options: SearchOptions = {},
) {
    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(
        (word) => !STOP_WORDS.has(fold(word)),
    );
    if (!tokens.length) return [];
    const matchQuery = tokens.map((token) => `"${token}"`).join(' OR ');
    const topicFilter = options.topic
        ? sql`AND EXISTS (SELECT 1 FROM json_each(n.topics) WHERE value = ${options.topic})`
        : sql``;
    const lifecycleFilter = options.includeHistory ? sql`` : sql`AND n.lifecycle = 'active'`;
    const result = await db.run(sql`
        SELECT f.id, f.title, f.body, f.aliases,
            n.revision, n.lifecycle, n.grounding, n.endorsement, n.topics,
            snippet(neurons_fts, 2, '[', ']', '…', 24) AS snippet,
            bm25(neurons_fts, 0, 8, 1, 5) AS rank
        FROM neurons_fts AS f JOIN neurons AS n ON n.id = f.id
        WHERE neurons_fts MATCH ${matchQuery} ${topicFilter} ${lifecycleFilter}
        ORDER BY rank LIMIT 100
    `);
    const minimum = Math.max(1, Math.ceil(tokens.length * 0.6));
    const selected = result.rows
        .map((row) => {
            const words = new Set(
                fold(`${row.title} ${row.aliases} ${row.body}`).match(/[\p{L}\p{N}]+/gu) ?? [],
            );
            const matchedTerms = tokens.filter((token) => words.has(fold(token)));
            return { row, matchedTerms };
        })
        .filter(({ matchedTerms }) => matchedTerms.length >= minimum)
        .sort(
            (a, b) =>
                b.matchedTerms.length - a.matchedTerms.length ||
                Number(a.row.rank) - Number(b.row.rank),
        )
        .slice(0, Math.max(1, Math.min(50, limit)));
    return Promise.all(
        selected.map(async ({ row, matchedTerms }) => {
            const cautions = await db.run(sql`
            SELECT n.id, n.title, n.lifecycle, n.revision, s.kind
            FROM synapses AS s JOIN neurons AS n ON n.id = s.source_neuron_id
            WHERE s.target_neuron_id = ${row.id} AND s.kind IN ('contradicts', 'questions')
            UNION
            SELECT n.id, n.title, n.lifecycle, n.revision, s.kind
            FROM synapses AS s JOIN neurons AS n ON n.id = s.target_neuron_id
            WHERE s.source_neuron_id = ${row.id} AND s.kind IN ('contradicts', 'questions')
            UNION
            SELECT id, title, lifecycle, revision, 'superseded-by' AS kind
            FROM neurons WHERE id = (SELECT superseded_by FROM neurons WHERE id = ${row.id})
        `);
            return {
                id: String(row.id),
                title: String(row.title),
                revision: String(row.revision),
                rank: Number(row.rank),
                snippet: String(row.snippet),
                lifecycle: String(row.lifecycle),
                grounding: String(row.grounding),
                endorsement: String(row.endorsement),
                topics: JSON.parse(String(row.topics)) as string[],
                matchedTerms,
                queryTermCount: tokens.length,
                cautions: cautions.rows,
            };
        }),
    );
}
