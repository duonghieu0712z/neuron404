import { readPartialReferences } from '#lib/server/neuron/partial-references';
import { readRegions } from '#lib/server/neuron/regions';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

export async function incompleteContext(id: string) {
    const reference = (await readPartialReferences())[id];
    if (!reference) {
        return false;
    }
    const regions = new Set((await readRegions()).map((region) => region.id));
    if (reference.regions.some((region) => !regions.has(region))) {
        return true;
    }
    for (const target of reference.neurons) {
        try {
            await readNeuronSnapshot(target);
        } catch {
            return true;
        }
    }
    return false;
}
