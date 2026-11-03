import type { Actions } from './$types';

import { fail, redirect } from '@sveltejs/kit';

import { newNeuronInputSchema } from '#lib/neuron/schema';
import { db } from '#lib/server/db';
import { createNeuron } from '#lib/server/neuron/create';

export const actions: Actions = {
    default: async ({ request }) => {
        const form = await request.formData();

        const parsed = newNeuronInputSchema.safeParse({
            title: form.get('title'),
            body: form.get('body'),
            grounding: form.get('grounding'),
            endorsement: form.get('endorsement'),
            provenance: form.get('provenance'),
        });

        if (!parsed.success) {
            return fail(400, { errors: parsed.error.flatten().fieldErrors });
        }

        const neuron = await createNeuron(db, parsed.data);

        throw redirect(303, `/neurons/${neuron.id}`);
    },
};
