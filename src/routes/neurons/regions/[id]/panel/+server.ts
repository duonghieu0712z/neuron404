import { error } from '@sveltejs/kit';

import { readRegionOverview } from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';

export async function GET({ params }) {
    if (!(await readRegions()).some((region) => region.id === params.id)) {
        error(404, 'Region not found');
    }

    return Response.json(await readRegionOverview(params.id), {
        headers: { 'Cache-Control': 'no-store' },
    });
}
