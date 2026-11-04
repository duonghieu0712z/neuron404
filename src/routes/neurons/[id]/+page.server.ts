import type { PageServerLoad } from './$types';

import { getNeuronDetail } from '#lib/server/neuron/get-detail';

export const load: PageServerLoad = async ({ params }) => {
    return getNeuronDetail(params.id);
};
