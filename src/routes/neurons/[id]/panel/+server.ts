import type { RequestHandler } from './$types';

import { json } from '@sveltejs/kit';

import { getNeuronDetail } from '#lib/server/neuron/get-detail';

export const GET: RequestHandler = async ({ params }) => {
    const detail = await getNeuronDetail(params.id);
    return json(detail);
};
