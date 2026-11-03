import type { PageServerLoad } from './$types';

import { lintNeurons } from '#lib/server/neuron/lint';

export const load: PageServerLoad = async () => {
    const issues = await lintNeurons();
    return { issues };
};
