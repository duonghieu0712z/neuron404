import { buildNetworkModel } from '#lib/network/model';

import { readRegions } from './regions';
import { fingerprint, withStorageLock } from './storage';
import { readAllNeurons } from './store';

export async function readNetworkSnapshot() {
    return withStorageLock(async () => {
        const [neurons, regions] = await Promise.all([readAllNeurons(), readRegions()]);
        const network = buildNetworkModel(neurons, regions);

        return { network, revision: fingerprint(JSON.stringify(network)) };
    });
}
