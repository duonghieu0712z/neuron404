import type { ReviewBundle } from './review-bundle';
import type { ReviewOutput } from '#lib/neuron/review';

import { reviewOutputSchema } from '#lib/neuron/review';

import { evidencePassages } from './passages';
import { paragraphs } from './review-input';

export function validate(
    output: ReviewOutput,
    bundle: ReviewBundle,
    subjects: string[],
    candidate?: string,
) {
    const neurons = new Map(
        [...bundle.members, ...bundle.context].map(({ neuron }) => [
            neuron.id,
            `${neuron.title}\n${neuron.body}`,
        ]),
    );

    const sources = new Map(bundle.sources.map(({ id, source }) => [id, source.content]));
    const seen = new Set<string>();

    for (const check of output.checks) {
        if (!subjects.includes(check.subject) || seen.has(check.subject)) {
            throw new Error('Review has duplicate or unknown check subjects.');
        }

        seen.add(check.subject);

        if (check.verdict === 'supported' && !check.evidence.length) {
            throw new Error('A supported check requires quoted evidence.');
        }

        if (
            candidate !== undefined &&
            check.verdict === 'supported' &&
            !check.evidence.some(
                (item) =>
                    item.kind === 'neuron' &&
                    bundle.members.some(({ neuron }) => neuron.id === item.id),
            )
        ) {
            throw new Error(
                'A supported overview paragraph must quote a member neuron, not itself.',
            );
        }

        if (candidate === undefined && check.verdict === 'supported') {
            const member = bundle.members.find(({ neuron }) => neuron.id === check.subject)!;

            if (
                !check.evidence.some(
                    (item) => item.kind === 'source' && member.neuron.sources.includes(item.id),
                )
            ) {
                throw new Error(
                    'A source-supported neuron check must quote its own supplied source.',
                );
            }
        }
    }

    if (seen.size !== subjects.length) {
        throw new Error('Review did not check every supplied subject.');
    }

    if (candidate === undefined) {
        for (const check of output.checks) {
            if (
                check.verdict === 'supported' ||
                output.findings.some((finding) => finding.neurons.includes(check.subject))
            ) {
                continue;
            }

            const member = bundle.members.find(({ neuron }) => neuron.id === check.subject)!;
            output.findings.push({
                kind: check.verdict === 'unverifiable' ? 'missing-evidence' : 'unsupported',
                severity: check.verdict === 'unverifiable' ? 'low' : 'medium',
                neurons: [check.subject],
                explanation: `Evidence check requires attention: ${check.reason}`,
                suggestion:
                    'Review the cited claim and capture sufficient evidence or qualify the unsupported statement.',
                evidence: check.evidence.length
                    ? check.evidence
                    : [
                          {
                              kind: 'neuron',
                              id: check.subject,
                              quote: evidencePassages(member.neuron.body)[0],
                          },
                      ],
                synapse: null,
            });
        }
    }

    for (const evidence of [
        ...output.checks.flatMap((check) => check.evidence),
        ...output.findings.flatMap((finding) => finding.evidence),
    ]) {
        let text: string | undefined;

        if (evidence.kind === 'neuron') {
            text = neurons.get(evidence.id);
        } else if (evidence.kind === 'source') {
            text = sources.get(evidence.id);
        } else if (evidence.id === bundle.region.id) {
            text = candidate;
        }

        if (text === undefined || !text.includes(evidence.quote)) {
            throw new Error('Review evidence quote does not match its supplied artifact.');
        }
    }

    for (const finding of output.findings) {
        if (finding.neurons.some((id) => !neurons.has(id))) {
            throw new Error('Finding references a neuron outside the reviewed scope.');
        }

        if (
            finding.synapse &&
            (!neurons.has(finding.synapse.source) ||
                !neurons.has(finding.synapse.target) ||
                finding.synapse.source === finding.synapse.target ||
                !['source', 'target'].every((key) =>
                    finding.neurons.includes(finding.synapse![key as 'source' | 'target']),
                ))
        ) {
            throw new Error('Proposed synapse endpoints must be distinct reviewed neurons.');
        }
    }

    if (output.findings.length || output.checks.some((check) => check.verdict !== 'supported')) {
        output.verdict = 'needs-review';
    }

    if (output.verdict === 'pass' && output.findings.length) {
        throw new Error('A passing review cannot contain unresolved findings.');
    }

    return output;
}

export function validateReviewOutput(output: ReviewOutput, bundle: ReviewBundle, body?: string) {
    const parsed = reviewOutputSchema.parse(output);

    if (body !== undefined) {
        const ids = new Set(bundle.members.map(({ neuron }) => neuron.id));
        const citations = [...body.matchAll(/\]\(neuron:([a-zA-Z0-9_-]+)\)/g)];

        if (!citations.length || citations.some((match) => !ids.has(match[1]))) {
            throw new Error('Overview citations must reference its member neurons.');
        }
    }

    return validate(
        parsed,
        bundle,
        body === undefined
            ? bundle.members.map(({ neuron }) => neuron.id)
            : paragraphs(body).map(({ id }) => id),
        body,
    );
}
