import { error, json } from '@sveltejs/kit';

import { readRegionOverview } from '#lib/server/neuron/region-overview';
import { readTopics } from '#lib/server/neuron/topics';

export async function GET({ params }) {
    if (!(await readTopics()).some((region) => region.id === params.id))
        error(404, 'Region not found');
    return json(await readRegionOverview(params.id), { headers: { 'Cache-Control': 'no-store' } });
}
