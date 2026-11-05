import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { CONTENT_DIR, fingerprint, safeId } from './storage';
import { listNeuronFiles, readNeuronSnapshot } from './store';
import { readTopics } from './topics';

export async function readNeuronContext(ids: string[]) {
    if (!ids.length || ids.length > 50)
        throw new Error('Read requires between 1 and 50 neuron IDs');
    const snapshots = await Promise.all(
        (await listNeuronFiles()).map((file) => readNeuronSnapshot(file.slice(0, -3))),
    );
    const byId = new Map(snapshots.map((item) => [item.neuron.id, item]));
    return ids.map((id) => {
        const current = byId.get(id);
        if (!current) throw new Error(`Neuron not found: ${id}`);
        const incoming = snapshots.flatMap(({ neuron }) =>
            neuron.synapses
                .filter((edge) => edge.target === id)
                .map((edge) => ({ source: neuron.id, kind: edge.kind, note: edge.note })),
        );
        const relatedIds = new Set([
            ...current.neuron.synapses
                .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                .map((edge) => edge.target),
            ...incoming
                .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                .map((edge) => edge.source),
        ]);
        const visited = new Set([id]);
        let replacement = current.neuron.supersededBy;
        while (replacement && !visited.has(replacement)) {
            visited.add(replacement);
            relatedIds.add(replacement);
            replacement = byId.get(replacement)?.neuron.supersededBy;
        }
        const cautions = [...relatedIds]
            .map((target) => byId.get(target))
            .filter((item) => item !== undefined)
            .map(({ neuron, revision }) => ({ neuron, revision }));
        return { neuron: current.neuron, revision: current.revision, incoming, cautions };
    });
}

export async function readNeuronHistory(id: string, revision?: string) {
    const directory = path.join(CONTENT_DIR, 'history', safeId(id));
    if (revision) {
        if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid revision');
        const raw = await readFile(path.join(directory, `${revision}.md`), 'utf8');
        if (fingerprint(raw) !== revision) throw new Error('Revision integrity failure');
        return { id, revision, raw };
    }
    try {
        return {
            id,
            revisions: (await readdir(directory))
                .filter((file) => /^[a-f0-9]{64}\.md$/.test(file))
                .map((file) => file.slice(0, -3)),
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { id, revisions: [] };
        throw error;
    }
}

export async function readCatalog() {
    const [topics, files] = await Promise.all([readTopics(), listNeuronFiles()]);
    const snapshots = await Promise.all(files.map((file) => readNeuronSnapshot(file.slice(0, -3))));
    return {
        neuronCount: snapshots.length,
        topics: topics.map((topic) => ({
            ...topic,
            count: snapshots.filter(({ neuron }) => neuron.topics.includes(topic.id)).length,
        })),
        unfiled: snapshots.filter(({ neuron }) => !neuron.topics.length).length,
    };
}
