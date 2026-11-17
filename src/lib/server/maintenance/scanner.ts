import { listNeuronFiles, readNeuronSnapshot } from '#lib/server/neuron/store';

export async function scanNeurons() {
    const snapshots: Awaited<ReturnType<typeof readNeuronSnapshot>>[] = [];
    const errors: Record<string, string> = {};
    for (const name of await listNeuronFiles()) {
        try {
            snapshots.push(await readNeuronSnapshot(name.slice(0, -3)));
        } catch (error) {
            errors[name] = error instanceof Error ? error.message : String(error);
        }
    }
    return { snapshots, errors };
}
