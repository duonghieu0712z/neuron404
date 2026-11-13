import type { PageServerLoad } from './$types';

import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons } from '#lib/server/db/schema';
import { ensureIndex } from '#lib/server/neuron/indexer';
import { readRegions } from '#lib/server/neuron/regions';
import { searchNeurons } from '#lib/server/neuron/search';

export const load: PageServerLoad = async ({ url }) => {
    await ensureIndex(db);
    const query = url.searchParams.get('q')?.trim() ?? '';

    const matches = query ? await searchNeurons(db, query, 50) : [];
    const order = new Map(matches.map((match, index) => [match.id, index]));
    let rows: (typeof neurons.$inferSelect)[] = [];
    if (!query) {
        rows = await db
            .select()
            .from(neurons)
            .where(eq(neurons.lifecycle, 'active'))
            .orderBy(desc(neurons.updatedAt));
    } else if (matches.length) {
        rows = (
            await db
                .select()
                .from(neurons)
                .where(
                    inArray(
                        neurons.id,
                        matches.map((match) => match.id),
                    ),
                )
        ).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }

    const groups = (await readRegions())
        .map(({ id, title }) => ({
            id,
            title,
            neurons: rows.filter((neuron) => neuron.regions.includes(id)),
        }))
        .filter((group) => group.neurons.length > 0);
    const unfiled = rows.filter((neuron) => neuron.regions.length === 0);
    if (unfiled.length) {
        groups.push({ id: 'region:unfiled', title: 'Unfiled', neurons: unfiled });
    }

    return { groups, query };
};
