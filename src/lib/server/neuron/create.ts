import type { NewNeuronInput } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { rebuildIndex } from './indexer';
import { createNeuronId, writeNeuron } from './store';

export async function createNeuron(db: Db, input: NewNeuronInput) {
    const now = new Date().toISOString();

    const frontmatter = neuronFrontmatterSchema.parse({
        id: createNeuronId(),
        title: input.title,
        status: 'draft',
        created: now,
        updated: now,
        grounding: input.grounding,
        endorsement: input.endorsement,
        provenance: input.provenance,
        synapses: input.synapses,
    });

    await writeNeuron(frontmatter, input.body);
    await rebuildIndex(db);

    return frontmatter;
}
