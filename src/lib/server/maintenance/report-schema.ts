import { z } from 'zod';

import { reviewFindingSchema, reviewOutputSchema } from '#lib/neuron/review';
import { regionIdSchema } from '#lib/neuron/schema';

export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const revisionsSchema = z.record(z.string(), hashSchema);

export const reportSchema = z.object({
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

export const decisionsSchema = z.record(
    hashSchema,
    z.object({
        status: z.enum(['resolved', 'dismissed']),
        note: z.string(),
        report: hashSchema,
        at: z.string(),
    }),
);
