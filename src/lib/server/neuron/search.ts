import type { Db } from '#lib/server/db/client';

import { sql } from 'drizzle-orm';

export interface SearchResult {
    id: string;
    rank: number;
    snippet: string;
    title: string;
}

function toMatchQuery(query: string): string {
    const tokens = query.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
    if (tokens.length === 0) throw new Error('Search query has no searchable terms');

    return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ');
}

export async function searchNeurons(db: Db, query: string, limit = 10): Promise<SearchResult[]> {
    const matchQuery = toMatchQuery(query);

    const result = await db.run(sql`
        SELECT
            id,
            title,
            snippet(neurons_fts, 2, '[', ']', '…', 12) AS snippet,
            bm25(neurons_fts) AS rank
        FROM neurons_fts
        WHERE neurons_fts MATCH ${matchQuery}
        ORDER BY rank
        LIMIT ${limit}
    `);

    return result.rows.map((row) => ({
        id: String(row.id),
        rank: Number(row.rank),
        snippet: String(row.snippet),
        title: String(row.title),
    }));
}
