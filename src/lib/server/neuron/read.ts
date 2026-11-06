import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { and, count, eq, sql } from 'drizzle-orm';

import { SYNAPSE_KINDS } from '#lib/neuron/schema';
import { neurons, synapses } from '#lib/server/db/schema';
import { readRegionReviews } from '#lib/server/maintenance/reports';

import { readIndexedNeuron, withIndexedStore } from './indexed-store';
import { readRegions } from './regions';
import { fold } from './search';
import { CONTENT_DIR, fingerprint, safeId } from './storage';
import { readNeuronSnapshot } from './store';

export async function readNeuronContext(ids: string[]) {
    if (!ids.length || ids.length > 50)
        throw new Error('Read requires between 1 and 50 neuron IDs');
    return withIndexedStore(async (db) => {
        const cache = new Map<string, Awaited<ReturnType<typeof readNeuronSnapshot>>>();
        const read = async (id: string) => {
            const cached = cache.get(id);
            if (cached) return cached;
            const snapshot = await readIndexedNeuron(db, id);
            cache.set(id, snapshot);
            return snapshot;
        };
        const selected = [];
        for (const id of ids) selected.push(await read(id));
        const regionIds = [...new Set(selected.flatMap(({ neuron }) => neuron.regions))];
        const reviews = (
            await Promise.all(regionIds.map((id) => readRegionReviews(id, undefined, db)))
        )
            .flat()
            .filter((report) => report.kind === 'knowledge');
        const result = [];
        for (const current of selected) {
            const id = current.neuron.id;
            const edges = await db
                .select({
                    source: synapses.sourceNeuronId,
                    kind: synapses.kind,
                    note: synapses.note,
                })
                .from(synapses)
                .where(eq(synapses.targetNeuronId, id))
                .orderBy(synapses.sourceNeuronId)
                .limit(201);
            const incoming = edges.slice(0, 200);
            const relatedIds = new Set<string>();
            let truncated = edges.length > incoming.length;
            const visited = new Set([id]);
            let replacement = current.neuron.supersededBy;
            while (replacement && !visited.has(replacement)) {
                if (relatedIds.size >= 50) {
                    truncated = true;
                    break;
                }
                visited.add(replacement);
                relatedIds.add(replacement);
                replacement = (await read(replacement)).neuron.supersededBy;
            }
            const cautions = [
                ...current.neuron.synapses
                    .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                    .map((edge) => edge.target),
                ...incoming
                    .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                    .map((edge) => edge.source),
            ];
            for (const target of cautions) {
                if (relatedIds.has(target)) continue;
                if (relatedIds.size >= 50) {
                    truncated = true;
                    break;
                }
                relatedIds.add(target);
            }
            const related = [];
            for (const target of relatedIds) {
                const { neuron, revision } = await read(target);
                related.push({ neuron, revision });
            }
            result.push({
                neuron: current.neuron,
                revision: current.revision,
                incoming,
                cautions: related,
                contextTruncated: truncated,
                reviews: reviews
                    .filter(
                        (report) =>
                            report.checks.some((check) => check.subject === id) ||
                            report.findings.some((finding) => finding.neurons.includes(id)),
                    )
                    .map((report) => ({
                        id: report.id,
                        kind: report.kind,
                        region: report.region,
                        createdAt: report.createdAt,
                        stale: report.stale,
                        summary: report.summary,
                        verdict: report.verdict,
                        coverage: report.coverage,
                        checks: report.checks.filter((check) => check.subject === id),
                        findings: report.findings.filter((finding) => finding.neurons.includes(id)),
                    })),
            });
        }
        return result;
    });
}

export async function readNeuronHistory(id: string, revision?: string) {
    const directory = path.join(CONTENT_DIR, 'history', safeId(id));
    if (revision) {
        if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid revision');
        const raw = await readFile(path.join(directory, `${revision}.md`), 'utf8');
        if (fingerprint(raw) !== revision) throw new Error('Revision integrity failure');
        return { id, revision, raw };
    }
    try {
        return {
            id,
            revisions: (await readdir(directory))
                .filter((file) => /^[a-f0-9]{64}\.md$/.test(file))
                .map((file) => file.slice(0, -3)),
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { id, revisions: [] };
        throw error;
    }
}

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
    )
        throw new Error('Catalog requires limit 1-50 and a nonnegative integer offset');
    return withIndexedStore(async (db) => {
        const regions = await readRegions();
        if (options.region) {
            const region = regions.find((item) => item.id === options.region);
            if (!region) throw new Error(`Unknown region: ${options.region}`);
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
    )
        throw new Error('Neighbors requires limit 1-50 and a nonnegative integer offset');
    if (!['both', 'incoming', 'outgoing'].includes(direction)) throw new Error('Unknown direction');
    if (options.kind && !SYNAPSE_KINDS.some((kind) => kind === options.kind))
        throw new Error('Unknown synapse kind');
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
