import type { Actions } from './$types';
import type { NewNeuronInput } from '#lib/neuron/schema';

import { fail, redirect } from '@sveltejs/kit';

import { newNeuronInputSchema } from '#lib/neuron/schema';
import { db } from '#lib/server/db';
import { createNeuron } from '#lib/server/neuron/create';
import { readTopics } from '#lib/server/neuron/topics';

export const load = async () => ({ topics: await readTopics() });

export const actions: Actions = {
    default: async ({ request }) => {
        const form = await request.formData();

        const parsed = newNeuronInputSchema.safeParse({
            title: form.get('title'),
            body: form.get('body'),
            grounding: form.get('grounding'),
            endorsement: form.get('endorsement'),
            provenance: form.get('provenance'),
            topics: form.get('topic') ? [form.get('topic')] : [],
        });

        if (!parsed.success) {
            return fail(400, { errors: parsed.error.flatten().fieldErrors });
        }
        const topics = await readTopics();
        if (parsed.data.topics.some((id) => !topics.some((topic) => topic.id === id))) {
            const errors: Partial<Record<keyof NewNeuronInput, string[]>> = {
                topics: ['Unknown region'],
            };
            return fail(400, { errors });
        }

        const neuron = await createNeuron(db, parsed.data);

        throw redirect(303, `/neurons/${neuron.id}`);
    },
};
