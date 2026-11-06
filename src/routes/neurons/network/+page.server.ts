import type { PageServerLoad } from './$types';

import { buildNetworkModel } from '#lib/network/model';
import { readRegions } from '#lib/server/neuron/regions';
import { readAllNeurons } from '#lib/server/neuron/store';

export const load: PageServerLoad = async () => {
    const [neurons, regions] = await Promise.all([readAllNeurons(), readRegions()]);
    return buildNetworkModel(neurons, regions);
};
