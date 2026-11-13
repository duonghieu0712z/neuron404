import type { Actions, PageServerLoad } from './$types';

import { error, fail } from '@sveltejs/kit';

import { db } from '#lib/server/db';
import { resolveProposal } from '#lib/server/proposals/service';
import { readProposal } from '#lib/server/proposals/storage';

export const load: PageServerLoad = async ({ params }) => {
    if (!/^[a-f0-9-]{36}$/.test(params.id)) {
        error(404, 'Proposal not found.');
    }

    try {
        return await readProposal(params.id);
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            error(404, 'Proposal not found.');
        }

        throw cause;
    }
};

export const actions: Actions = {
    default: async ({ params, request }) => {
        const form = await request.formData();

        try {
            await resolveProposal(db, params.id, {
                expectedRevision: form.get('revision'),
                accepted: form.getAll('accepted').map(String),
            });

            return { resolved: true };
        } catch (cause) {
            return fail(409, {
                message: cause instanceof Error ? cause.message : 'Could not resolve proposal.',
            });
        }
    },
};
