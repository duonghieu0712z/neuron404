import type { ReviewBundle, Snapshot } from './review-bundle';
import type { ReviewOutput } from '#lib/neuron/review';

import { z } from 'zod';

import { reviewOutputSchema } from '#lib/neuron/review';

import { evidencePassages } from './passages';

const referenceSchema = z.object({ ref: z.string().min(1) });

const modelReviewSchema = reviewOutputSchema.extend({
    checks: z
        .array(
            reviewOutputSchema.shape.checks.element.extend({
                evidence: z.array(referenceSchema).max(8),
            }),
        )
        .min(1)
        .max(150),
    findings: z
        .array(
            reviewOutputSchema.shape.findings.element.extend({
                evidence: z.array(referenceSchema).min(1).max(8),
            }),
        )
        .max(50),
});

export function referenceInput(bundle: ReviewBundle, body?: string) {
    const evidence = new Map<string, ReviewOutput['checks'][number]['evidence'][number]>();

    function passages(kind: 'neuron' | 'source' | 'overview', id: string, text: string) {
        const result = [];

        for (const quote of evidencePassages(text)) {
            const ref = `e${evidence.size + 1}`;
            evidence.set(ref, { kind, id, quote });
            result.push({ ref, kind, id, text: quote });
        }

        return result;
    }

    function member({ neuron, revision }: Snapshot) {
        const { body, ...metadata } = neuron;
        return { ...metadata, revision, passages: passages('neuron', neuron.id, body) };
    }

    const members = bundle.members.map(member);

    if (body !== undefined) {
        const sections = paragraphs(body);

        const input = JSON.stringify({
            region: bundle.region,
            candidate: body,
            paragraphs: sections,
            members,
            candidatePassages: passages('overview', bundle.region.id, body),
        });
        return { input, evidence };
    }

    const input = JSON.stringify({
        asOf: new Date().toISOString().slice(0, 10),
        region: bundle.region,
        members,
        relatedContext: bundle.context.map(member),
        sources: bundle.sources.map(({ source, ...metadata }) => {
            const { content, ...origin } = source;

            return {
                ...metadata,
                source: { ...origin, passages: passages('source', metadata.id, content) },
            };
        }),
        unavailableSources: bundle.unavailableSources,
        changedMembers: bundle.changed,
        priorOpenFindings: bundle.previousReport?.findings ?? [],
        coverage:
            'All Region members, direct semantic neighbors and replacements, and up to three title/alias matches outside the Region. This is not an exhaustive comparison of every pair in the store. External sources were not refreshed.',
    });
    return { input, evidence };
}

export function expandReferences(
    output: z.infer<typeof modelReviewSchema>,
    catalog: ReturnType<typeof referenceInput>['evidence'],
): ReviewOutput {
    function expand(items: { ref: string }[]) {
        return items.map(({ ref }) => {
            const item = catalog.get(ref);

            if (!item) {
                throw new Error('Review references an unknown evidence passage.');
            }

            return item;
        });
    }

    return {
        ...output,
        checks: output.checks.map((check) => ({ ...check, evidence: expand(check.evidence) })),
        findings: output.findings.map((finding) => ({
            ...finding,
            evidence: expand(finding.evidence),
        })),
    };
}

export function scopedReviewSchema(
    bundle: ReviewBundle,
    catalog: ReturnType<typeof referenceInput>['evidence'],
    body?: string,
) {
    const allowed = [...bundle.members, ...bundle.context].map(({ neuron }) => neuron.id) as [
        string,
        ...string[],
    ];

    const neuron = z.enum(allowed);

    const subjects = (
        body === undefined
            ? bundle.members.map(({ neuron }) => neuron.id)
            : paragraphs(body).map(({ id }) => id)
    ) as [string, ...string[]];

    const references = [...catalog.keys()] as [string, ...string[]];

    const memberReferences = [...catalog]
        .filter(
            ([, item]) =>
                item.kind === 'neuron' &&
                bundle.members.some(({ neuron }) => neuron.id === item.id),
        )
        .map(([ref]) => ref) as [string, ...string[]];

    const evidence = z.object({ ref: z.enum(references) });

    const checkEvidence =
        body === undefined ? evidence : z.object({ ref: z.enum(memberReferences) });

    const finding = modelReviewSchema.shape.findings.element;

    return modelReviewSchema.extend({
        checks: z
            .array(
                modelReviewSchema.shape.checks.element.extend({
                    subject: z.enum(subjects),
                    evidence: z.array(checkEvidence).max(8),
                }),
            )
            .min(1)
            .max(150),
        findings: z
            .array(
                finding.extend({
                    neurons: z.array(neuron).min(1).max(12),
                    evidence: z.array(evidence).min(1).max(8),
                    synapse: finding.shape.synapse
                        .unwrap()
                        .extend({ source: neuron, target: neuron })
                        .nullable(),
                }),
            )
            .max(50),
    });
}

export function paragraphs(body: string) {
    return body
        .split(/\n\s*\n/)
        .filter((text) => text.trim() && !/^#{1,6}\s/.test(text))
        .map((text, index) => ({ id: `p${index + 1}`, text }));
}
