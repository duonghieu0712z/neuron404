import type { PageServerLoad } from './$types';

import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons, synapses } from '#lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
    const neuron = await db.query.neurons.findFirst({ where: eq(neurons.id, params.id) });
    if (!neuron) throw error(404, 'Neuron not found');

    const outgoing = await db
        .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, target: neurons })
        .from(synapses)
        .innerJoin(neurons, eq(neurons.id, synapses.targetNeuronId))
        .where(eq(synapses.sourceNeuronId, params.id));

    const incoming = await db
        .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, source: neurons })
        .from(synapses)
        .innerJoin(neurons, eq(neurons.id, synapses.sourceNeuronId))
        .where(eq(synapses.targetNeuronId, params.id));

    return { neuron, outgoing, incoming };
};
