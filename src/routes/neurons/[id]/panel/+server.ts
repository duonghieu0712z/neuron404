import type { RequestHandler } from './$types';

import { getNeuronDetail } from '#lib/server/neuron/get-detail';

export const GET: RequestHandler = async ({ params }) => {
    const detail = await getNeuronDetail(params.id);

    return Response.json(detail);
};
