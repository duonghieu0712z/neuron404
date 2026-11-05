import type { NewNeuronInput, UpdateNeuronInput } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { neuronFrontmatterSchema, updateNeuronInputSchema } from '#lib/neuron/schema';

import { withStorageLock } from './storage';
import { createNeuronId, readNeuronSnapshot } from './store';
import { commitNeuron } from './write';

export async function createNeuron(db: Db, input: NewNeuronInput) {
    return withStorageLock(async () => {
        const now = new Date().toISOString();
        const frontmatter = neuronFrontmatterSchema.parse({
            ...input,
            id: createNeuronId(),
            status: 'draft',
            created: now,
            updated: now,
        });
        return commitNeuron(db, { ...frontmatter, body: input.body });
    });
}

export async function updateNeuron(db: Db, id: string, input: UpdateNeuronInput) {
    const { expectedRevision, ...changes } = updateNeuronInputSchema.parse(input);
    return withStorageLock(async () => {
        const current = await readNeuronSnapshot(id);
        if (current.revision !== expectedRevision)
            throw new Error(
                'Revision conflict. Read the current neuron and merge your changes before retrying.',
            );
        const combined = { ...current.neuron, ...changes, updated: new Date().toISOString() };
        if (combined.supersededBy === null) delete combined.supersededBy;
        const frontmatter = neuronFrontmatterSchema.parse(combined);
        return commitNeuron(
            db,
            { ...frontmatter, body: changes.body ?? current.neuron.body },
            current.raw,
        );
    });
}
