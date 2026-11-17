import type { Neuron } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';
import { markReviewDirtyUnlocked } from '#lib/server/maintenance/dirty';

import { synchronizeIndexUnlocked } from './indexer';
import { readPartialReferences } from './partial-references';
import { readRegions } from './regions';
import { readSource } from './sources';
import { fingerprint, markIndexDirty } from './storage';
import {
    archiveNeuron,
    listNeuronFiles,
    readNeuronSnapshot,
    recordOperation,
    writeNeuron,
} from './store';

export async function validateNeuronReferences(neuron: Neuron) {
    const partial = await readPartialReferences();
    const regions = new Set((await readRegions()).map((region) => region.id));
    const snapshots = await Promise.all(
        (await listNeuronFiles()).map((name) =>
            readNeuronSnapshot(name.slice(0, -3)).catch(() => null),
        ),
    );
    const existing = new Map(
        snapshots.filter((item) => item !== null).map(({ neuron }) => [neuron.id, neuron]),
    );
    existing.set(neuron.id, neuron);
    for (const id of neuron.regions) {
        if (!regions.has(id) && !partial[neuron.id]?.regions.includes(id)) {
            throw new Error(`Unknown region: ${id}`);
        }
    }
    for (const edge of neuron.synapses) {
        if (!existing.has(edge.target) && !partial[neuron.id]?.neurons.includes(edge.target)) {
            throw new Error(`Unknown synapse target: ${edge.target}`);
        }
    }
    await Promise.all(neuron.sources.map(readSource));
    if ((neuron.lifecycle === 'superseded') !== Boolean(neuron.supersededBy)) {
        throw new Error('A superseded neuron must name its replacement; other states must not.');
    }
    const visited = new Set([neuron.id]);
    let owner = neuron.id;
    let replacement = neuron.supersededBy;
    while (replacement) {
        if (visited.has(replacement)) {
            throw new Error('Supersession cycle');
        }
        visited.add(replacement);
        const target = existing.get(replacement);
        if (!target) {
            if (partial[owner]?.neurons.includes(replacement)) {
                break;
            }
            throw new Error(`Unknown replacement: ${replacement}`);
        }
        owner = target.id;
        replacement = target.supersededBy;
    }
}

export class NeuronPostWriteError extends Error {
    constructor(
        message: string,
        readonly stage: 'archive' | 'journal' | 'index',
        readonly revision: string,
        cause: unknown,
    ) {
        super(message, { cause });
    }
}

export async function commitNeuron(db: Db, neuron: Neuron, previousRaw?: string) {
    await validateNeuronReferences(neuron);
    if (previousRaw !== undefined) {
        await archiveNeuron(neuron.id, previousRaw);
    }
    await markIndexDirty();
    const { body, ...frontmatter } = neuron;
    await writeNeuron(neuronFrontmatterSchema.parse(frontmatter), body);
    const saved = await readNeuronSnapshot(neuron.id);
    await markReviewDirtyUnlocked(neuron.id);
    let stage: 'archive' | 'journal' | 'index' = 'archive';
    try {
        await archiveNeuron(neuron.id, saved.raw);
        stage = 'journal';
        await recordOperation(
            previousRaw === undefined ? 'create' : 'update',
            neuron.id,
            saved.revision,
            previousRaw === undefined ? undefined : fingerprint(previousRaw),
        );
        stage = 'index';
        await synchronizeIndexUnlocked(db);
    } catch (error) {
        throw new NeuronPostWriteError(
            `Neuron ${neuron.id} was saved at revision ${saved.revision}, but post-write processing failed. Read the saved neuron before retrying; run neuron index to recover its index. ${String(error)}`,
            stage,
            saved.revision,
            error,
        );
    }
    return { ...saved.neuron, revision: saved.revision };
}
