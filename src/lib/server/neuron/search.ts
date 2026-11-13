import type { Db } from '#lib/server/db/client';

import { sql } from 'drizzle-orm';

const STOP_WORDS = new Set(
    'a an the is are was were to of for in on and or what how why can do does i my we you me about la co cua va voi cho mot nhung cac thi ma nay do o tu toi khi gi nao sao nhu the duoc khong hay ve xin hay'.split(
        ' ',
    ),
);

export function fold(text: string) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export interface SearchOptions {
    region?: string;
    includeHistory?: boolean;
    offset?: number;
}

function searchQuery(query: string, options: SearchOptions = {}) {
    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(
        (word) => !STOP_WORDS.has(fold(word)),
    );

    if (!tokens.length) {
        return null;
    }

    if (tokens.length > 24) {
        throw new Error('Search accepts at most 24 distinct terms. Use a more specific query.');
    }

    const matchQuery = tokens.map((token) => `"${token}"*`).join(' OR ');
    const matches = sql.join(
        tokens.map(
            (token, index) => sql`
        SELECT rowid AS neuron_rowid, ${index} AS term FROM neurons_fts WHERE neurons_fts MATCH ${`"${token}"*`}
    `,
        ),
        sql` UNION ALL `,
    );
    const minimum = Math.max(1, Math.ceil(tokens.length * 0.6));
    const regionFilter = options.region
        ? sql`AND EXISTS (SELECT 1 FROM json_each(n.regions) WHERE value = ${options.region})`
        : sql``;
    const lifecycleFilter = options.includeHistory ? sql`` : sql`AND n.lifecycle = 'active'`;

    return {
        tokens,
        coverage: sql`WITH term_matches AS (${matches}), coverage AS (
            SELECT neuron_rowid, COUNT(*) AS matched, GROUP_CONCAT(term) AS matched_terms
            FROM term_matches GROUP BY neuron_rowid HAVING COUNT(*) >= ${minimum}
        )`,
        filter: sql`WHERE neurons_fts MATCH ${matchQuery} ${regionFilter} ${lifecycleFilter}`,
    };
}

export async function searchNeuronIds(db: Db, query: string) {
    const search = searchQuery(query);

    if (!search) {
        return [];
    }

    const result = await db.run(sql`${search.coverage}
        SELECT f.id FROM neurons_fts AS f JOIN neurons AS n ON n.id = f.id
        JOIN coverage AS c ON c.neuron_rowid = f.rowid
        ${search.filter} ORDER BY c.matched DESC, bm25(neurons_fts, 0, 8, 1, 5, 6), f.id
    `);

    return result.rows.map((row) => String(row.id));
}

export async function searchNeurons(
    db: Db,
    query: string,
    limit = 10,
    options: SearchOptions = {},
) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new Error('Search limit must be an integer from 1 to 50');
    }

    const offset = options.offset ?? 0;

    if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('Search offset must be a nonnegative integer');
    }

    const search = searchQuery(query, options);

    if (!search) {
        return [];
    }

    const { tokens } = search;
    const result = await db.run(sql`
        ${search.coverage}
        SELECT f.id, f.title, n.retrieval_cues,
            n.revision, n.lifecycle, n.grounding, n.endorsement, n.regions, c.matched_terms,
            snippet(neurons_fts, 2, '[', ']', '…', 24) AS snippet,
            bm25(neurons_fts, 0, 8, 1, 5, 6) AS rank
        FROM neurons_fts AS f JOIN neurons AS n ON n.id = f.id
        JOIN coverage AS c ON c.neuron_rowid = f.rowid
        ${search.filter}
        ORDER BY c.matched DESC, rank, f.id LIMIT ${Math.max(1, Math.min(50, limit))} OFFSET ${offset}
    `);
    const selected = result.rows.map((row) => ({
        row,
        matchedTerms: String(row.matched_terms)
            .split(',')
            .map((index) => tokens[Number(index)]),
    }));

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
                retrievalCues: JSON.parse(String(row.retrieval_cues)) as string[],
                revision: String(row.revision),
                rank: Number(row.rank),
                snippet: String(row.snippet),
                lifecycle: String(row.lifecycle),
                grounding: String(row.grounding),
                endorsement: String(row.endorsement),
                regions: JSON.parse(String(row.regions)) as string[],
                matchedTerms,
                queryTermCount: tokens.length,
                cautions: cautions.rows,
            };
        }),
    );
}
