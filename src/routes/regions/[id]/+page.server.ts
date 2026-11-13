import type { Actions, PageServerLoad } from './$types';

import { error, fail } from '@sveltejs/kit';

import { readReadingPath, writeReadingPath } from '#lib/server/neuron/reading-path';
import { readRegionOverview } from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';

export const load: PageServerLoad = async ({ params }) => {
    if (!(await readRegions()).some((region) => region.id === params.id)) {
        error(404, 'Region not found.');
    }

    return {
        overview: await readRegionOverview(params.id),
        readingPath: await readReadingPath(params.id),
    };
};

export const actions: Actions = {
    save: async ({ params, request }) => {
        const form = await request.formData();

        try {
            const ids = form.getAll('step').map(String);

            await writeReadingPath(params.id, {
                introduction: form.get('introduction'),
                expectedRevision: form.get('revision') || null,
                steps: ids.map((id, index) => ({
                    id,
                    purpose: String(form.get(`purpose-${index}`) ?? ''),
                })),
            });

            return { saved: true };
        } catch (cause) {
            return fail(400, {
                message: cause instanceof Error ? cause.message : 'Could not save reading path.',
            });
        }
    },
};
