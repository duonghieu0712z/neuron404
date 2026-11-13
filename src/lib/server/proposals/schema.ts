import { z } from 'zod';

import { neuronFrontmatterSchema, newNeuronInputSchema } from '#lib/neuron/schema';

export const proposalInputSchema = z
    .object({
        expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
        author: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(10_000),
        changes: z
            .object({
                title: newNeuronInputSchema.shape.title.optional(),
                body: newNeuronInputSchema.shape.body.optional(),
                sources: newNeuronInputSchema.shape.sources.removeDefault().optional(),
                synapses: newNeuronInputSchema.shape.synapses.removeDefault().optional(),
            })
            .strict(),
    })
    .strict();

export const proposalSchema = z.object({
    id: z.string().uuid(),
    neuronId: z.string().min(1),
    created: z.string(),
    author: z.string(),
    reason: z.string(),
    baseRevision: z.string().regex(/^[a-f0-9]{64}$/),
    base: neuronFrontmatterSchema.and(z.object({ body: z.string() })),
    patch: proposalInputSchema.shape.changes,
    status: z.enum(['pending', 'applying', 'applied', 'rejected']),
    resolution: z
        .object({
            accepted: z.array(z.string()),
            revision: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .nullable(),
            at: z.string(),
        })
        .optional(),
});

export type Proposal = z.infer<typeof proposalSchema>;
