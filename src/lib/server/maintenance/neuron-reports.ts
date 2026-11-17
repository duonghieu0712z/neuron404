import type { ReviewReport, ReviewView } from '#lib/neuron/review';

import { reviewEvidenceKey } from '#lib/neuron/review';
import { readSource } from '#lib/server/neuron/sources';
import { fingerprint } from '#lib/server/neuron/storage';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { listArtifacts, saveArtifact } from './artifacts';
import { assertReviewDependencies } from './dependencies';
import { disputeEventSchema, readDispute, listDisputes } from './disputes';
import { reportSchema } from './report-schema';

export async function saveNeuronReport(input: Omit<ReviewReport, 'id'>) {
    const content = reportSchema.omit({ id: true }).parse(input);
    const report = { id: fingerprint(JSON.stringify(content)), ...content };
    const neurons = {
        ...report.members,
        ...report.context,
        ...Object.fromEntries((report.catalog ?? []).map((item) => [item.id, item.revision])),
    };
    const snapshots = await Promise.all(
        Object.keys(neurons).map((id) => readNeuronSnapshot(id).catch(() => null)),
    );
    const regions = [...new Set(snapshots.flatMap((snapshot) => snapshot?.neuron.regions ?? []))];
    const artifact = await saveArtifact({
        version: 1,
        type: 'report',
        at: report.createdAt,
        neurons,
        sources: report.sources,
        regions,
        parents: [],
        payload: report,
    });
    for (const finding of report.reviewedInputCurrent === false ? [] : report.findings) {
        const dispute = fingerprint(
            JSON.stringify({
                kind: finding.kind,
                neurons: [...finding.neurons].sort(),
                claims: finding.evidence
                    .filter((item) => item.kind === 'neuron')
                    .map((item) => [item.id, item.quote.trim().replace(/\s+/g, ' ')])
                    .sort(),
            }),
        );
        const existing = await readDispute(dispute).catch((error) => {
            if ((error as Error).message === 'Dispute not found.') {
                return null;
            }
            throw error;
        });
        if (
            existing?.events.some((event) => event.payload.inputRevision === report.inputRevision)
        ) {
            continue;
        }
        if (existing?.status === 'conflict' || existing?.incomplete) {
            continue;
        }
        const last = existing?.events.at(-1);
        const evidenceSources = [
            ...new Set(
                finding.evidence.filter((item) => item.kind === 'source').map((item) => item.id),
            ),
        ].sort();
        const issueRegions = [
            ...new Set(
                snapshots
                    .filter((snapshot) => snapshot && finding.neurons.includes(snapshot.neuron.id))
                    .flatMap((snapshot) => snapshot!.neuron.regions),
            ),
        ];
        const relevant = Object.fromEntries(
            Object.entries(neurons).filter(([id]) => finding.neurons.includes(id)),
        );
        if (last && JSON.stringify(last.sources) === JSON.stringify(evidenceSources)) {
            continue;
        }
        const conflict = finding.kind === 'contradiction';
        const payload = disputeEventSchema.parse({
            dispute,
            action: conflict ? 'open' : 'waiting-evidence',
            note: `${finding.explanation}\n${finding.suggestion}`,
            author: 'maintenance',
            evidence: finding.evidence,
            report: report.id,
            finding: finding.id,
            inputRevision: report.inputRevision,
        });
        await saveArtifact({
            version: 1,
            type: 'dispute',
            at: report.createdAt,
            neurons: relevant,
            sources: evidenceSources,
            regions: issueRegions,
            parents: existing?.heads ?? [artifact.id],
            payload,
        });
    }
    return report;
}

export async function readNeuronReviews(id: string): Promise<ReviewView[]> {
    const artifacts = (await listArtifacts('report')).filter(
        (item) => item.payload.scope && (item.payload.scope as { neuron: string }).neuron === id,
    );
    const latest = new Map<number, (typeof artifacts)[number]>();
    const latestScopeSet = artifacts.at(-1)?.payload.scopeSetRevision;
    for (const item of artifacts.filter(
        (item) => item.payload.scopeSetRevision === latestScopeSet,
    )) {
        latest.set((item.payload.scope as { part: number }).part, item);
    }
    const result: ReviewView[] = [];
    const disputes = await listDisputes();
    for (const item of latest.values()) {
        const report = reportSchema.parse(item.payload);
        const evidenceDetails: ReviewView['evidenceDetails'] = {};
        let stale = report.reviewedInputCurrent === false;
        try {
            await assertReviewDependencies(item.neurons, item.sources);
        } catch {
            stale = true;
        }
        for (const [neuron, revision] of Object.entries(item.neurons)) {
            try {
                if ((await readNeuronSnapshot(neuron)).revision !== revision) {
                    stale = true;
                }
            } catch {
                stale = true;
            }
        }
        for (const evidence of [
            ...report.checks.flatMap((check) => check.evidence),
            ...report.findings.flatMap((finding) => finding.evidence),
        ]) {
            let body = '';
            let title = 'Unavailable evidence';
            let available = true;
            try {
                if (evidence.kind === 'source') {
                    const { source } = await readSource(evidence.id);
                    body = source.content;
                    title = source.title;
                } else {
                    const { neuron } = await readNeuronSnapshot(evidence.id);
                    body = neuron.body;
                    title = neuron.title;
                }
            } catch {
                available = false;
            }
            const offset = body.indexOf(evidence.quote);
            evidenceDetails[reviewEvidenceKey(evidence)] = {
                title,
                available,
                matchesCurrent: offset >= 0,
                leading: offset > 0,
                trailing: offset >= 0 && offset + evidence.quote.length < body.length,
            };
        }
        result.push({
            ...report,
            stale,
            appliesToCurrentOverview: false,
            evidenceDetails,
            findings: report.findings.map((finding) => {
                const dispute = disputes.find((dispute) =>
                    dispute.events.some((event) => event.payload.finding === finding.id),
                );
                const status =
                    dispute?.status === 'resolved' || dispute?.status === 'dismissed'
                        ? dispute.status
                        : 'open';
                return {
                    ...finding,
                    status,
                    note: dispute?.events.at(-1)?.payload.note as string | undefined,
                };
            }),
        });
    }
    return result;
}
