import { z } from 'zod';

import { SYNAPSE_KINDS } from './schema';

export const reviewEvidenceSchema = z.object({
    kind: z.enum(['neuron', 'source', 'overview']),
    id: z.string().min(1),
    quote: z.string().min(1).max(2000),
});
export const reviewFindingSchema = z.object({
    kind: z.enum([
        'unsupported',
        'contradiction',
        'outdated',
        'duplicate',
        'missing-link',
        'missing-concept',
        'missing-evidence',
        'scope',
    ]),
    severity: z.enum(['high', 'medium', 'low']),
    neurons: z.array(z.string()).min(1).max(12),
    explanation: z.string().min(20).max(3000),
    suggestion: z.string().min(10).max(3000),
    evidence: z.array(reviewEvidenceSchema).min(1).max(8),
    synapse: z
        .object({
            source: z.string(),
            target: z.string(),
            kind: z.enum(SYNAPSE_KINDS),
            note: z.string(),
        })
        .nullable(),
});
export const reviewOutputSchema = z.object({
    verdict: z.enum(['pass', 'needs-review']),
    summary: z.string().min(20).max(3000),
    checks: z
        .array(
            z.object({
                subject: z.string(),
                verdict: z.enum(['supported', 'partial', 'unsupported', 'unverifiable']),
                reason: z.string().min(10).max(1500),
                evidence: z.array(reviewEvidenceSchema).max(8),
            }),
        )
        .min(1)
        .max(150),
    findings: z.array(reviewFindingSchema).max(50),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema> & {
    id: string;
    originReport?: string;
    carriedForward?: boolean;
};
export interface ReviewReport {
    id: string;
    version: 1;
    kind: 'knowledge' | 'overview';
    region: string;
    createdAt: string;
    inputRevision: string;
    regionRevision: string;
    members: Record<string, string>;
    context: Record<string, string>;
    sources: string[];
    unavailableSources: string[];
    coverage: string;
    candidateHash?: string;
    summary: string;
    verdict: ReviewOutput['verdict'];
    checks: ReviewOutput['checks'];
    findings: ReviewFinding[];
}
export interface ReviewView extends ReviewReport {
    evidenceDetails: Record<
        string,
        {
            title: string;
            available: boolean;
            leading: boolean;
            trailing: boolean;
            matchesCurrent: boolean;
        }
    >;
    stale: boolean;
    appliesToCurrentOverview: boolean;
    findings: (ReviewFinding & { status: 'open' | 'resolved' | 'dismissed'; note?: string })[];
}

export function reviewEvidenceKey(evidence: { kind: string; id: string; quote: string }) {
    let hash = 0xcbf29ce484222325n;
    for (const character of evidence.quote) {
        hash ^= BigInt(character.codePointAt(0)!);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `${evidence.kind}:${evidence.id}:${hash.toString(16)}`;
}
