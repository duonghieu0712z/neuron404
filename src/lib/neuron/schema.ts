import { z } from 'zod';

export const NEURON_STATUSES = ['draft', 'published'] as const;
export const GROUNDING_LEVELS = ['assumption', 'inferred', 'sourced'] as const;
export const ENDORSEMENT_LEVELS = ['unreviewed', 'self-endorsed', 'reviewed', 'disputed'] as const;
export const PROVENANCE_SOURCES = ['original', 'derived', 'external'] as const;
export const SYNAPSE_KINDS = ['supports', 'contradicts', 'extends', 'cites', 'questions'] as const;

export const synapseSchema = z.object({
    target: z.string().min(1),
    kind: z.enum(SYNAPSE_KINDS),
    note: z.string().optional(),
});

export const neuronFrontmatterSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(NEURON_STATUSES).default('draft'),
    created: z.string(),
    updated: z.string(),
    grounding: z.enum(GROUNDING_LEVELS),
    endorsement: z.enum(ENDORSEMENT_LEVELS),
    provenance: z.enum(PROVENANCE_SOURCES),
    synapses: z.array(synapseSchema).default([]),
});

export const newNeuronInputSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    grounding: z.enum(GROUNDING_LEVELS),
    endorsement: z.enum(ENDORSEMENT_LEVELS),
    provenance: z.enum(PROVENANCE_SOURCES),
    synapses: z.array(synapseSchema).default([]),
});

export type Synapse = z.infer<typeof synapseSchema>;
export type NeuronFrontmatter = z.infer<typeof neuronFrontmatterSchema>;
export type Neuron = NeuronFrontmatter & { body: string };
export type NewNeuronInput = z.infer<typeof newNeuronInputSchema>;
