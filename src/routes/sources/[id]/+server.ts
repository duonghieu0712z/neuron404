import type { RequestHandler } from './$types';

import { error } from '@sveltejs/kit';

import { readSource } from '#lib/server/neuron/sources';

export const GET: RequestHandler = async ({ params }) => {
    if (!/^[a-f0-9]{64}$/.test(params.id)) {
        error(400, 'Invalid source ID.');
    }

    try {
        return Response.json(await readSource(params.id));
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            error(404, 'Source not found.');
        }

        throw cause;
    }
};
