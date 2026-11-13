import type { RequestHandler } from './$types';

import { readNetworkSnapshot } from '#lib/server/neuron/network';

export const GET: RequestHandler = async ({ request }) => {
    const snapshot = await readNetworkSnapshot();
    const headers = { ETag: `"${snapshot.revision}"`, 'Cache-Control': 'no-store' };

    if (request.headers.get('if-none-match') === headers.ETag) {
        return new Response(null, { status: 304, headers });
    }

    return Response.json(snapshot, { headers });
};
