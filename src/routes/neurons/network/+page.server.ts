import type { PageServerLoad } from './$types';

import { buildNetworkModel } from '#lib/network/model';
import { readAllNeurons } from '#lib/server/neuron/store';
import { readTopics } from '#lib/server/neuron/topics';

export const load: PageServerLoad = async () => {
    const [neurons, regions] = await Promise.all([readAllNeurons(), readTopics()]);
    return buildNetworkModel(neurons, regions);
};
