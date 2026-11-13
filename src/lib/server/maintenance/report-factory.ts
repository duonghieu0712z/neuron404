import type { ReviewOutput, ReviewReport } from '#lib/neuron/review';

import { fingerprint } from '#lib/server/neuron/storage';

import { bundleRevisions, type ReviewBundle } from './review-bundle';

export function makeReport(
    kind: ReviewReport['kind'],
    bundle: ReviewBundle,
    inputRevision: string,
    output: ReviewOutput,
    body?: string,
): Omit<ReviewReport, 'id'> {
    return {
        version: 1,
        kind,
        region: bundle.region.id,
        createdAt: new Date().toISOString(),
        inputRevision,
        ...bundleRevisions(bundle),
        unavailableSources: bundle.unavailableSources,
        coverage:
            kind === 'overview'
                ? 'Overview-to-member fidelity, with one check per paragraph. Original sources and external factual truth were not checked in this report.'
                : 'All Region members against their supplied source snapshots, direct semantic neighbors and replacements, and up to three external title/alias candidates. Sources were not refreshed; this is not an exhaustive all-pairs audit.',
        ...(body === undefined ? {} : { candidateHash: fingerprint(body.trim()) }),
        summary: output.summary,
        verdict: output.verdict,
        checks: output.checks,
        findings: output.findings.map((finding) => ({
            ...finding,
            id: fingerprint(
                JSON.stringify({
                    kind: finding.kind,
                    neurons: [...finding.neurons].sort(),
                    evidence: finding.evidence.map((item) => JSON.stringify(item)).sort(),
                    revisions: [...bundle.members, ...bundle.context]
                        .filter(({ neuron }) => finding.neurons.includes(neuron.id))
                        .map(({ neuron, revision }) => [neuron.id, revision])
                        .sort(([a], [b]) => a.localeCompare(b)),
                }),
            ),
        })),
    };
}
