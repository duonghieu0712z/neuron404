import type { ReviewView } from '#lib/neuron/review';
import type { Db } from '#lib/server/db/client';
import type { IndexSnapshot } from '#lib/server/neuron/indexed-store';

import path from 'node:path';

import matter from '@11ty/gray-matter';
import { inArray } from 'drizzle-orm';

import { reviewEvidenceKey } from '#lib/neuron/review';
import { regionIdSchema } from '#lib/neuron/schema';
import { neurons } from '#lib/server/db/schema';
import { readIndexSnapshots, withIndexedStore } from '#lib/server/neuron/indexed-store';
import { readRegions } from '#lib/server/neuron/regions';
import { readSource } from '#lib/server/neuron/sources';
import { CONTENT_DIR, fingerprint } from '#lib/server/neuron/storage';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { optional, readDecisions, readLatestReport } from './report-storage';

export async function readRegionReviews(
    regionId: string,
    snapshots?: IndexSnapshot[],
    db?: Db,
): Promise<ReviewView[]> {
    const reports = (
        await Promise.all(
            (['knowledge', 'overview'] as const).map((kind) => readLatestReport(regionId, kind)),
        )
    ).filter((report) => report !== null);

    if (!reports.length) {
        return [];
    }

    if (!snapshots) {
        if (!db) {
            return withIndexedStore((store) => readRegionReviews(regionId, undefined, store));
        }

        const members = await readIndexSnapshots(db, { region: regionId });

        const context = await readIndexSnapshots(db, {
            ids: [...new Set(reports.flatMap((report) => Object.keys(report.context)))],
        });
        snapshots = [
            ...new Map([...members, ...context].map((item) => [item.neuron.id, item])).values(),
        ];
    }

    const byId = new Map(snapshots.map((item) => [item.neuron.id, item]));
    const members = snapshots.filter(
        ({ neuron }) => neuron.lifecycle === 'active' && neuron.regions.includes(regionId),
    );
    const region = (await readRegions()).find((item) => item.id === regionId);
    const decisions = await readDecisions();

    const overviewRaw = await optional(
        path.join(CONTENT_DIR, 'regions', `${regionIdSchema.parse(regionId)}.md`),
    );

    const overviewHash =
        overviewRaw === null ? null : fingerprint(matter(overviewRaw, {}).content.trim());

    const evidenceSources = new Map<string, { title: string; body: string }>();

    const evidenceIds = [
        ...new Set(
            reports
                .flatMap((report) => [
                    ...report.findings.flatMap((finding) => finding.evidence),
                    ...report.checks.flatMap((check) => check.evidence),
                ])
                .filter((item) => item.kind === 'neuron')
                .map((item) => item.id),
        ),
    ];

    let evidenceNeurons: { id: string; title: string; body: string }[] = [];

    if (db && evidenceIds.length) {
        evidenceNeurons = await db
            .select({ id: neurons.id, title: neurons.title, body: neurons.body })
            .from(neurons)
            .where(inArray(neurons.id, evidenceIds));
    } else if (!db) {
        const snapshots = await Promise.all(
            evidenceIds.map(async (id) => {
                try {
                    return (await readNeuronSnapshot(id)).neuron;
                } catch {
                    return null;
                }
            }),
        );
        evidenceNeurons = snapshots.filter((neuron) => neuron !== null);
    }

    for (const neuron of evidenceNeurons) {
        evidenceSources.set(`neuron:${neuron.id}`, { title: neuron.title, body: neuron.body });
    }

    if (region && overviewRaw !== null) {
        evidenceSources.set(`overview:${regionId}`, {
            title: region.title,
            body: matter(overviewRaw, {}).content.trim(),
        });
    }

    const unavailable = new Set<string>();

    for (const id of new Set(reports.flatMap((report) => report.sources))) {
        try {
            const { source } = await readSource(id);
            evidenceSources.set(`source:${id}`, { title: source.title, body: source.content });
        } catch {
            unavailable.add(id);
        }
    }

    return reports.map((report) => ({
        ...report,
        evidenceDetails: Object.fromEntries(
            [
                ...report.findings.flatMap((finding) => finding.evidence),
                ...report.checks.flatMap((check) => check.evidence),
            ].map((evidence) => {
                const source = evidenceSources.get(`${evidence.kind}:${evidence.id}`);
                const offset = source?.body.indexOf(evidence.quote) ?? -1;

                return [
                    reviewEvidenceKey(evidence),
                    {
                        title:
                            source?.title ??
                            {
                                neuron: 'Unavailable neuron',
                                overview: 'Region overview',
                                source: 'Unavailable source',
                            }[evidence.kind],
                        available: source !== undefined,
                        matchesCurrent: offset >= 0,
                        leading: offset > 0,
                        trailing:
                            offset >= 0 && offset + evidence.quote.length < source!.body.length,
                    },
                ];
            }),
        ),
        stale:
            fingerprint(JSON.stringify(region ?? null)) !== report.regionRevision ||
            members.length !== Object.keys(report.members).length ||
            members.some(({ neuron, revision }) => report.members[neuron.id] !== revision) ||
            Object.entries(report.context).some(
                ([id, revision]) => byId.get(id)?.revision !== revision,
            ) ||
            report.sources.some(
                (id) => unavailable.has(id) !== report.unavailableSources.includes(id),
            ),
        appliesToCurrentOverview:
            report.kind === 'overview' && report.candidateHash === overviewHash,
        findings: report.findings.map((finding) => ({
            ...finding,
            status: decisions[finding.id]?.status ?? 'open',
            note: decisions[finding.id]?.note,
        })),
    }));
}

export async function listReviewReports() {
    const result = [];

    for (const region of await readRegions()) {
        result.push(...(await readRegionReviews(region.id)));
    }

    return result;
}
