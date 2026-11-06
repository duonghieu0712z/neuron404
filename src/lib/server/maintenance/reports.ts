import type { ReviewReport, ReviewView } from '#lib/neuron/review';
import type { Db } from '#lib/server/db/client';
import type { IndexSnapshot } from '#lib/server/neuron/indexed-store';

import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import { reviewFindingSchema, reviewOutputSchema } from '#lib/neuron/review';
import { regionIdSchema } from '#lib/neuron/schema';
import { DATA_DIR } from '#lib/server/data-dir';
import { readIndexSnapshots, withIndexedStore } from '#lib/server/neuron/indexed-store';
import { readRegions } from '#lib/server/neuron/regions';
import { readSource } from '#lib/server/neuron/sources';
import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from '#lib/server/neuron/storage';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const revisionsSchema = z.record(z.string(), hashSchema);
const reportSchema = z.object({
    id: hashSchema,
    version: z.literal(1),
    kind: z.enum(['knowledge', 'overview']),
    region: regionIdSchema,
    createdAt: z.string(),
    inputRevision: hashSchema,
    regionRevision: hashSchema,
    members: revisionsSchema,
    context: revisionsSchema,
    sources: z.array(hashSchema),
    unavailableSources: z.array(hashSchema),
    coverage: z.string(),
    candidateHash: hashSchema.optional(),
    summary: z.string(),
    verdict: reviewOutputSchema.shape.verdict,
    checks: reviewOutputSchema.shape.checks,
    findings: z.array(
        reviewFindingSchema.extend({
            id: hashSchema,
            originReport: hashSchema.optional(),
            carriedForward: z.boolean().optional(),
        }),
    ),
});
const decisionsSchema = z.record(
    hashSchema,
    z.object({
        status: z.enum(['resolved', 'dismissed']),
        note: z.string(),
        report: hashSchema,
        at: z.string(),
    }),
);
const directory = path.join(DATA_DIR, 'maintenance');

async function optional(file: string) {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
}

function reportPath(region: string, kind: ReviewReport['kind'], id: string) {
    return path.join(
        directory,
        'reports',
        regionIdSchema.parse(region),
        kind,
        `${hashSchema.parse(id)}.json`,
    );
}

async function readAt(region: string, kind: ReviewReport['kind'], id: string) {
    const raw = await optional(reportPath(region, kind, id));
    if (raw === null) return null;
    const report = reportSchema.parse(JSON.parse(raw));
    const { id: actual, ...content } = report;
    if (
        actual !== id ||
        report.region !== region ||
        report.kind !== kind ||
        fingerprint(JSON.stringify(content)) !== id
    )
        throw new Error('Review report integrity failure.');
    return report;
}

export async function readLatestReport(region: string, kind: ReviewReport['kind']) {
    const raw = await optional(
        path.join(directory, 'reports', regionIdSchema.parse(region), kind, 'latest.json'),
    );
    if (raw === null) return null;
    const { id } = z.object({ id: hashSchema }).parse(JSON.parse(raw));
    const report = await readAt(region, kind, id);
    if (!report) throw new Error('Review report pointer has no matching report.');
    return report;
}

export async function readReport(id: string) {
    hashSchema.parse(id);
    let regions: string[];
    try {
        regions = await readdir(path.join(directory, 'reports'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
    for (const region of regions) {
        if (!regionIdSchema.safeParse(region).success) continue;
        for (const kind of ['knowledge', 'overview'] as const) {
            const report = await readAt(region, kind, id);
            if (report) return report;
        }
    }
    return null;
}

async function readDecisions() {
    const raw = await optional(path.join(directory, 'decisions.json'));
    return raw === null ? {} : decisionsSchema.parse(JSON.parse(raw));
}

export async function openReviewFindings(report: ReviewReport) {
    const decisions = await readDecisions();
    return report.findings.filter((finding) => !decisions[finding.id]);
}

export async function recordMaintenanceEvent(event: Record<string, unknown>) {
    await appendFile(
        path.join(directory, 'events.jsonl'),
        JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n',
        { mode: 0o600 },
    );
}

export async function saveReportUnlocked(input: Omit<ReviewReport, 'id'>) {
    const previous = await readLatestReport(input.region, input.kind);
    if (previous && input.kind === 'knowledge') {
        const decisions = await readDecisions();
        const ids = new Set(input.findings.map((finding) => finding.id));
        const identity = (finding: ReviewReport['findings'][number]) =>
            JSON.stringify({
                kind: finding.kind,
                neurons: [...finding.neurons].sort(),
                evidence: finding.evidence.map((item) => JSON.stringify(item)).sort(),
            });
        for (const finding of previous.findings) {
            if (decisions[finding.id] || ids.has(finding.id)) continue;
            const replacement = input.findings.find((item) => identity(item) === identity(finding));
            if (replacement) {
                replacement.originReport ??= finding.originReport ?? previous.id;
                continue;
            }
            input.findings.push({
                ...finding,
                originReport: finding.originReport ?? previous.id,
                carriedForward: true,
            });
        }
        if (input.findings.length) input.verdict = 'needs-review';
    }
    const content = reportSchema.omit({ id: true }).parse(input);
    const id = fingerprint(JSON.stringify(content));
    const report = { id, ...content };
    await atomicWrite(
        reportPath(report.region, report.kind, id),
        JSON.stringify(report, null, 2) + '\n',
        true,
    );
    await atomicWrite(
        path.join(directory, 'reports', report.region, report.kind, 'latest.json'),
        JSON.stringify({ id }),
    );
    await recordMaintenanceEvent({
        operation: 'review',
        report: id,
        region: report.region,
        kind: report.kind,
        inputRevision: report.inputRevision,
        verdict: report.verdict,
        findings: report.findings.length,
    });
    return report;
}

export async function decideFinding(
    reportId: string,
    findingId: string,
    status: 'resolved' | 'dismissed',
    note: string,
) {
    hashSchema.parse(findingId);
    z.enum(['resolved', 'dismissed']).parse(status);
    z.string().trim().min(10).max(2000).parse(note);
    return withStorageLock(async () => {
        const report = await readReport(reportId);
        if (!report?.findings.some((finding) => finding.id === findingId))
            throw new Error('Finding not found in the specified report.');
        const decisions = await readDecisions();
        decisions[findingId] = { status, note, report: reportId, at: new Date().toISOString() };
        await atomicWrite(
            path.join(directory, 'decisions.json'),
            JSON.stringify(decisions, null, 2),
        );
        await recordMaintenanceEvent({
            operation: 'finding-decision',
            report: reportId,
            finding: findingId,
            status,
            note,
        });
        return { finding: findingId, ...decisions[findingId] };
    });
}

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
    if (!reports.length) return [];
    if (!snapshots) {
        if (!db) return withIndexedStore((store) => readRegionReviews(regionId, undefined, store));
        const members = await readIndexSnapshots(db, { region: regionId });
        const context = await readIndexSnapshots(db, {
            ids: [...new Set(reports.flatMap((report) => Object.keys(report.context)))],
        });
        snapshots = [
            ...new Map([...members, ...context].map((item) => [item.neuron.id, item])).values(),
        ];
    }
    const byId = new Map(snapshots.map((item) => [item.neuron.id, item]));
    const members = snapshots.filter(({ neuron }) => neuron.regions.includes(regionId));
    const region = (await readRegions()).find((item) => item.id === regionId);
    const decisions = await readDecisions();
    const overviewRaw = await optional(
        path.join(CONTENT_DIR, 'regions', `${regionIdSchema.parse(regionId)}.md`),
    );
    const overviewHash =
        overviewRaw === null ? null : fingerprint(matter(overviewRaw, {}).content.trim());
    const unavailable = new Set<string>();
    for (const id of new Set(reports.flatMap((report) => report.sources))) {
        try {
            await readSource(id);
        } catch {
            unavailable.add(id);
        }
    }
    return reports.map((report) => ({
        ...report,
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
    for (const region of await readRegions()) result.push(...(await readRegionReviews(region.id)));
    return result;
}
