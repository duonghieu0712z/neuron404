import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

import { db } from '#lib/server/db';
import { ensureIndex } from '#lib/server/neuron/indexer';
import { searchNeuronIds } from '#lib/server/neuron/search';

export const GET: RequestHandler = async ({ url }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (query.length > 2000) error(400, 'Search query is too long.');
    await ensureIndex(db);
    try {
        return json(
            { ids: await searchNeuronIds(db, query) },
            {
                headers: { 'Cache-Control': 'no-store' },
            },
        );
    } catch (cause) {
        if (cause instanceof Error && cause.message.startsWith('Search accepts at most'))
            error(400, cause.message);
        throw cause;
    }
};
