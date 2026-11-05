import type { Neuron } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { synchronizeIndexUnlocked } from './indexer';
import { readSource } from './sources';
import { fingerprint, markIndexDirty } from './storage';
import {
    archiveNeuron,
    readAllNeurons,
    readNeuronSnapshot,
    recordOperation,
    writeNeuron,
} from './store';
import { readTopics } from './topics';

export async function validateNeuronReferences(neuron: Neuron) {
    const topics = new Set((await readTopics()).map((topic) => topic.id));
    const existing = new Map((await readAllNeurons()).map((item) => [item.id, item]));
    existing.set(neuron.id, neuron);
    for (const id of neuron.topics) if (!topics.has(id)) throw new Error(`Unknown region: ${id}`);
    for (const edge of neuron.synapses)
        if (!existing.has(edge.target)) throw new Error(`Unknown synapse target: ${edge.target}`);
    await Promise.all(neuron.sources.map(readSource));
    if ((neuron.lifecycle === 'superseded') !== Boolean(neuron.supersededBy))
        throw new Error('A superseded neuron must name its replacement; other states must not.');
    const visited = new Set([neuron.id]);
    let replacement = neuron.supersededBy;
    while (replacement) {
        if (visited.has(replacement)) throw new Error('Supersession cycle');
        visited.add(replacement);
        const target = existing.get(replacement);
        if (!target) throw new Error(`Unknown replacement: ${replacement}`);
        replacement = target.supersededBy;
    }
}

export async function commitNeuron(db: Db, neuron: Neuron, previousRaw?: string) {
    await validateNeuronReferences(neuron);
    if (previousRaw !== undefined) await archiveNeuron(neuron.id, previousRaw);
    await markIndexDirty();
    const { body, ...frontmatter } = neuron;
    await writeNeuron(neuronFrontmatterSchema.parse(frontmatter), body);
    const saved = await readNeuronSnapshot(neuron.id);
    try {
        await archiveNeuron(neuron.id, saved.raw);
        await recordOperation(
            previousRaw === undefined ? 'create' : 'update',
            neuron.id,
            saved.revision,
            previousRaw === undefined ? undefined : fingerprint(previousRaw),
        );
        await synchronizeIndexUnlocked(db);
    } catch (error) {
        throw new Error(
            `Neuron ${neuron.id} was saved at revision ${saved.revision}, but post-write processing failed. Read the saved neuron before retrying; run neuron index to recover its index. ${String(error)}`,
            { cause: error },
        );
    }
    return { ...saved.neuron, revision: saved.revision };
}
