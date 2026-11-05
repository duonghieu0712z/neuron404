import type { PageServerLoad } from './$types';

import { desc, inArray } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons } from '#lib/server/db/schema';
import { synchronizeIndex } from '#lib/server/neuron/indexer';
import { searchNeurons } from '#lib/server/neuron/search';

export const load: PageServerLoad = async ({ url }) => {
    await synchronizeIndex(db);
    const query = url.searchParams.get('q')?.trim() ?? '';

    const matches = query ? await searchNeurons(db, query, 50) : [];
    const order = new Map(matches.map((match, index) => [match.id, index]));
    const rows = query
        ? matches.length
            ? (
                  await db
                      .select()
                      .from(neurons)
                      .where(
                          inArray(
                              neurons.id,
                              matches.map((match) => match.id),
                          ),
                      )
              ).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
            : []
        : await db.select().from(neurons).orderBy(desc(neurons.updatedAt));

    return { neurons: rows, query };
};
