import type { PageServerLoad } from './$types';

import { readNetworkSnapshot } from '#lib/server/neuron/network';

export const load: PageServerLoad = () => readNetworkSnapshot();
