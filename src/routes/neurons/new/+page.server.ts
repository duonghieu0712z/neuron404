import type { Actions } from './$types';
import type { NewNeuronInput } from '#lib/neuron/schema';

import { fail, redirect } from '@sveltejs/kit';

import { newNeuronInputSchema } from '#lib/neuron/schema';
import { db } from '#lib/server/db';
import { createNeuron } from '#lib/server/neuron/create';
import { readRegions } from '#lib/server/neuron/regions';

export const load = async () => ({ regions: await readRegions() });

export const actions: Actions = {
    default: async ({ request }) => {
        const form = await request.formData();

        const parsed = newNeuronInputSchema.safeParse({
            title: form.get('title'),
            body: form.get('body'),
            grounding: form.get('grounding'),
            endorsement: form.get('endorsement'),
            provenance: form.get('provenance'),
            regions: form.get('region') ? [form.get('region')] : [],
        });

        if (!parsed.success) {
            return fail(400, { errors: parsed.error.flatten().fieldErrors });
        }
        const regions = await readRegions();
        if (parsed.data.regions.some((id) => !regions.some((region) => region.id === id))) {
            const errors: Partial<Record<keyof NewNeuronInput, string[]>> = {
                regions: ['Unknown region'],
            };
            return fail(400, { errors });
        }

        const neuron = await createNeuron(db, parsed.data);

        throw redirect(303, `/neurons/${neuron.id}`);
    },
};
