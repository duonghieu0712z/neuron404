import type { ReviewReport } from '#lib/neuron/review';

import { appendFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { regionIdSchema } from '#lib/neuron/schema';
import { DATA_DIR } from '#lib/server/data-dir';
import { atomicWrite, fingerprint, withStorageLock } from '#lib/server/neuron/storage';

import { listArtifacts, saveArtifact } from './artifacts';
import { listDisputes } from './disputes';
import { decisionsSchema, hashSchema, reportSchema } from './report-schema';

export const directory = path.join(DATA_DIR, 'maintenance');

export async function optional(file: string) {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

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

    if (raw === null) {
        return null;
    }

    const report = reportSchema.parse(JSON.parse(raw));
    const { id: actual, ...content } = report;

    if (
        actual !== id ||
        report.region !== region ||
        report.kind !== kind ||
        fingerprint(JSON.stringify(content)) !== id
    ) {
        throw new Error('Review report integrity failure.');
    }

    return report;
}

export async function readLatestReport(region: string, kind: ReviewReport['kind']) {
    const raw = await optional(
        path.join(directory, 'reports', regionIdSchema.parse(region), kind, 'latest.json'),
    );

    if (raw === null) {
        const imported = (await listArtifacts('report'))
            .filter(
                (item) =>
                    item.payload.region === region &&
                    item.payload.kind === kind &&
                    !item.payload.scope,
            )
            .at(-1);
        return imported ? reportSchema.parse(imported.payload) : null;
    }

    const { id } = z.object({ id: hashSchema }).parse(JSON.parse(raw));
    const report = await readAt(region, kind, id);

    if (!report) {
        throw new Error('Review report pointer has no matching report.');
    }

    return report;
}

export async function readReport(id: string) {
    hashSchema.parse(id);
    const artifact = (await listArtifacts('report')).find((item) => item.payload.id === id);
    if (artifact) {
        return reportSchema.parse(artifact.payload);
    }
    let regions: string[];

    try {
        regions = await readdir(path.join(directory, 'reports'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw error;
    }

    for (const region of regions) {
        if (!regionIdSchema.safeParse(region).success) {
            continue;
        }

        for (const kind of ['knowledge', 'overview'] as const) {
            const report = await readAt(region, kind, id);

            if (report) {
                return report;
            }
        }
    }

    return null;
}

export async function readDecisions() {
    const raw = await optional(path.join(directory, 'decisions.json'));
    const decisions = raw === null ? {} : decisionsSchema.parse(JSON.parse(raw));
    for (const dispute of await listDisputes()) {
        for (const event of dispute.events) {
            if (
                typeof event.payload.finding === 'string' &&
                typeof event.payload.report === 'string'
            ) {
                const latest = dispute.events.at(-1)!;
                if (dispute.status === 'resolved' || dispute.status === 'dismissed') {
                    decisions[event.payload.finding] = {
                        status: dispute.status,
                        note: String(latest.payload.note),
                        report: event.payload.report,
                        at: latest.at,
                    };
                } else {
                    delete decisions[event.payload.finding];
                }
            }
        }
    }
    return decisions;
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
            if (decisions[finding.id] || ids.has(finding.id)) {
                continue;
            }

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

        if (input.findings.length) {
            input.verdict = 'needs-review';
        }
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

        if (!report?.findings.some((finding) => finding.id === findingId)) {
            throw new Error('Finding not found in the specified report.');
        }

        const events = (await listArtifacts('dispute')).filter(
            (event) => event.payload.finding === findingId,
        );
        if (events.length) {
            const parentIds = new Set(events.flatMap((event) => event.parents));
            const heads = events.filter((event) => !parentIds.has(event.id));
            if (heads.length !== 1) {
                throw new Error(
                    'Dispute decision conflict. Resolve current heads through dispute:resolve.',
                );
            }
            const previous = events.at(-1)!;
            await saveArtifact({
                version: 1,
                type: 'dispute',
                at: new Date().toISOString(),
                neurons: previous.neurons,
                sources: previous.sources,
                regions: previous.regions,
                parents: heads.map((event) => event.id),
                payload: { ...previous.payload, action: status, note, author: 'user' },
            });
        }
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
