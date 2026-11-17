import { listArtifacts } from '#lib/server/maintenance/artifacts';
import { readNeuronSnapshot } from '#lib/server/neuron/store';
import { listProposals } from '#lib/server/proposals/storage';

export const load = async () => {
    const artifacts = await listArtifacts();
    const byId = new Map(artifacts.map((item) => [item.id, item]));
    const decisions = [];
    for (const item of artifacts.filter(
        (item) =>
            item.type === 'repair' && item.payload.phase === 'human' && !item.payload.proposal,
    )) {
        let parent = item;
        const seen = new Set<string>();
        while (parent.type !== 'report' && parent.parents.length && !seen.has(parent.id)) {
            seen.add(parent.id);
            const next = byId.get(parent.parents[0]);
            if (!next) {
                break;
            }
            parent = next;
        }
        const neuronId =
            parent.type === 'report'
                ? (parent.payload.scope as { neuron?: string } | undefined)?.neuron
                : undefined;
        const current = neuronId ? await readNeuronSnapshot(neuronId).catch(() => null) : null;
        decisions.push({
            id: item.id,
            neuronId,
            title: current?.neuron.title ?? 'Incomplete review context',
            reason: String(item.payload.reason),
            at: item.at,
            stale: Boolean(neuronId && current?.revision !== item.neurons[neuronId]),
        });
    }
    return { proposals: await listProposals(), decisions };
};
