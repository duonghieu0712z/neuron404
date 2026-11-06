import { z } from 'zod';

export const NEURON_STATUSES = ['draft', 'published'] as const;
export const GROUNDING_LEVELS = ['assumption', 'inferred', 'sourced'] as const;
export const ENDORSEMENT_LEVELS = ['unreviewed', 'self-endorsed', 'reviewed', 'disputed'] as const;
export const PROVENANCE_SOURCES = ['original', 'derived', 'external'] as const;
export const SYNAPSE_KINDS = ['supports', 'contradicts', 'extends', 'cites', 'questions'] as const;

export const regionIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const regionSchema = z.object({
    id: regionIdSchema,
    title: z.string().min(1),
    description: z.string().default(''),
});
export const regionCatalogSchema = z.object({
    regions: z
        .array(regionSchema)
        .refine(
            (regions) => new Set(regions.map((region) => region.id)).size === regions.length,
            'Region IDs must be unique',
        ),
});
export type Region = z.infer<typeof regionSchema>;

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
        regions: z.array(regionIdSchema).default([]),
        synapses: z.array(synapseSchema).default([]),
        aliases: z.array(z.string().min(1)).default([]),
        sources: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
        lifecycle: z.enum(['active', 'superseded', 'retracted']).default('active'),
        supersededBy: z.string().min(1).optional(),
    })
    .passthrough()
    .refine((data) => !Object.hasOwn(data, 'topics'), {
        message: 'Legacy Region membership found. Run pnpm neuron migrate.',
    });

export const newNeuronInputSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    grounding: z.enum(GROUNDING_LEVELS),
    endorsement: z.enum(ENDORSEMENT_LEVELS),
    provenance: z.enum(PROVENANCE_SOURCES),
    regions: z.array(regionIdSchema).default([]),
    synapses: z.array(synapseSchema).default([]),
    aliases: z.array(z.string().min(1)).default([]),
    sources: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
});

export const classifiedNeuronInputSchema = newNeuronInputSchema.extend({
    regions: z
        .array(regionIdSchema)
        .min(1, 'Choose an existing Region or create one with region:add.'),
});

export const updateNeuronInputSchema = newNeuronInputSchema.partial().extend({
    regions: newNeuronInputSchema.shape.regions.removeDefault().optional(),
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
