import { and, count, eq, sql } from 'drizzle-orm';

import { neurons } from '#lib/server/db/schema';

import { withIndexedStore } from './indexed-store';
import { readRegions } from './regions';
import { fold } from './search';

export interface CatalogOptions {
    region?: string;
    query?: string;
    limit?: number;
    offset?: number;
    includeHistory?: boolean;
}

export async function readCatalog(options: CatalogOptions = {}) {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isInteger(offset) ||
        offset < 0
    ) {
        throw new Error('Catalog requires limit 1-50 and a nonnegative integer offset');
    }

    return withIndexedStore(async (db) => {
        const regions = await readRegions();

        if (options.region) {
            const region = regions.find((item) => item.id === options.region);

            if (!region) {
                throw new Error(`Unknown region: ${options.region}`);
            }

            const membership = sql`EXISTS (SELECT 1 FROM json_each(${neurons.regions}) WHERE value = ${region.id})`;

            const condition = options.includeHistory
                ? membership
                : and(membership, eq(neurons.lifecycle, 'active'));

            const [{ total }] = await db.select({ total: count() }).from(neurons).where(condition);

            const members = await db
                .select({
                    id: neurons.id,
                    title: neurons.title,
                    aliases: neurons.aliases,
                    retrievalCues: neurons.retrievalCues,
                    revision: neurons.revision,
                    lifecycle: neurons.lifecycle,
                })
                .from(neurons)
                .where(condition)
                .orderBy(neurons.title, neurons.id)
                .limit(limit)
                .offset(offset);

            return {
                region,
                neurons: members,
                total,
                offset,
                limit,
                nextOffset: offset + members.length < total ? offset + members.length : null,
            };
        }

        const totals = await db.run(
            sql`SELECT COUNT(*) AS total, SUM(CASE WHEN json_array_length(regions) = 0 THEN 1 ELSE 0 END) AS unfiled FROM neurons`,
        );

        const counts = await db.run(
            sql`SELECT value AS region, COUNT(*) AS count FROM neurons, json_each(neurons.regions) GROUP BY value`,
        );

        const byRegion = new Map(counts.rows.map((row) => [String(row.region), Number(row.count)]));
        const terms = fold(options.query ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];

        const matching = regions.filter((region) =>
            terms.every((term) =>
                fold(`${region.id} ${region.title} ${region.description}`).includes(term),
            ),
        );

        const page = matching
            .slice(offset, offset + limit)
            .map((region) => ({ ...region, count: byRegion.get(region.id) ?? 0 }));

        return {
            neuronCount: Number(totals.rows[0].total),
            regions: page,
            unfiled: Number(totals.rows[0].unfiled ?? 0),
            total: matching.length,
            offset,
            limit,
            nextOffset: offset + page.length < matching.length ? offset + page.length : null,
        };
    });
}
