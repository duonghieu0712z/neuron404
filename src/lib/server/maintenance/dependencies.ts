import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { listArtifacts, sourceCheckHeads } from './artifacts';

export async function assertReviewDependencies(neurons: Record<string, string>, sources: string[]) {
    for (const [id, revision] of Object.entries(neurons)) {
        if ((await readNeuronSnapshot(id)).revision !== revision) {
            throw new Error('Review dependency revision conflict.');
        }
    }
    for (const check of sourceCheckHeads(await listArtifacts('source-check')).filter(
        (check) => check.payload.snapshot,
    )) {
        if (
            (sources.includes(String(check.payload.original)) ||
                Object.keys(neurons).some((id) => Object.hasOwn(check.neurons, id))) &&
            !sources.includes(String(check.payload.snapshot))
        ) {
            throw new Error('Review source evidence changed during verification.');
        }
    }
}
