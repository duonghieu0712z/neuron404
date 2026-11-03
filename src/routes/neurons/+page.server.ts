import type { PageServerLoad } from './$types';

import { desc, like, or } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons } from '#lib/server/db/schema';

export const load: PageServerLoad = async ({ url }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';

    const rows = query
        ? await db
              .select()
              .from(neurons)
              .where(or(like(neurons.title, `%${query}%`), like(neurons.body, `%${query}%`)))
              .orderBy(desc(neurons.updatedAt))
        : await db.select().from(neurons).orderBy(desc(neurons.updatedAt));

    return { neurons: rows, query };
};
