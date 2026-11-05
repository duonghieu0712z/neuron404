import { z } from 'zod';

export const NEURON_STATUSES = ['draft', 'published'] as const;
export const GROUNDING_LEVELS = ['assumption', 'inferred', 'sourced'] as const;
export const ENDORSEMENT_LEVELS = ['unreviewed', 'self-endorsed', 'reviewed', 'disputed'] as const;
export const PROVENANCE_SOURCES = ['original', 'derived', 'external'] as const;
export const SYNAPSE_KINDS = ['supports', 'contradicts', 'extends', 'cites', 'questions'] as const;

export const topicIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const topicSchema = z.object({
    id: topicIdSchema,
    title: z.string().min(1),
    description: z.string().default(''),
});
export const topicCatalogSchema = z.object({
    topics: z
        .array(topicSchema)
        .refine(
            (topics) => new Set(topics.map((topic) => topic.id)).size === topics.length,
            'Region IDs must be unique',
        ),
});
export type Region = z.infer<typeof topicSchema>;
export type Topic = Region;

export const synapseSchema = z.object({
    target: z.string().min(1),
    kind: z.enum(SYNAPSE_KINDS),
    note: z.string().optional(),
});

export const neuronFrontmatterSchema = z
    .object({
        id: z.string().min(1),
        title: z.string().min(1),
        status: z.enum(NEURON_STATUSES).default('draft'),
        created: z.string(),
        updated: z.string(),
        grounding: z.enum(GROUNDING_LEVELS),
        endorsement: z.enum(ENDORSEMENT_LEVELS),
        provenance: z.enum(PROVENANCE_SOURCES),
        topics: z.array(topicIdSchema).default([]),
        synapses: z.array(synapseSchema).default([]),
        aliases: z.array(z.string().min(1)).default([]),
        sources: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
        lifecycle: z.enum(['active', 'superseded', 'retracted']).default('active'),
        supersededBy: z.string().min(1).optional(),
    })
    .passthrough();

export const newNeuronInputSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    grounding: z.enum(GROUNDING_LEVELS),
    endorsement: z.enum(ENDORSEMENT_LEVELS),
    provenance: z.enum(PROVENANCE_SOURCES),
    topics: z.array(topicIdSchema).default([]),
    synapses: z.array(synapseSchema).default([]),
    aliases: z.array(z.string().min(1)).default([]),
    sources: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
});

export const updateNeuronInputSchema = newNeuronInputSchema.partial().extend({
    topics: newNeuronInputSchema.shape.topics.removeDefault().optional(),
    synapses: newNeuronInputSchema.shape.synapses.removeDefault().optional(),
    aliases: newNeuronInputSchema.shape.aliases.removeDefault().optional(),
    sources: newNeuronInputSchema.shape.sources.removeDefault().optional(),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(NEURON_STATUSES).optional(),
    lifecycle: z.enum(['active', 'superseded', 'retracted']).optional(),
    supersededBy: z.string().min(1).nullable().optional(),
});

export const sourceInputSchema = z.object({
    title: z.string().min(1),
    uri: z.string().min(1),
    locator: z.string().optional(),
    content: z.string().min(1),
});

export type Synapse = z.infer<typeof synapseSchema>;
export type NeuronFrontmatter = z.infer<typeof neuronFrontmatterSchema>;
export type Neuron = NeuronFrontmatter & { body: string };
export type NewNeuronInput = z.infer<typeof newNeuronInputSchema>;
export type UpdateNeuronInput = z.infer<typeof updateNeuronInputSchema>;
