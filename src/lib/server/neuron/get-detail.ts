import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons, synapses } from '#lib/server/db/schema';

export type NeuronDetail = Awaited<ReturnType<typeof getNeuronDetail>>;

export async function getNeuronDetail(id: string) {
    const neuron = await db.query.neurons.findFirst({ where: eq(neurons.id, id) });
    if (!neuron) throw error(404, 'Neuron not found');

    const outgoing = await db
        .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, target: neurons })
        .from(synapses)
        .innerJoin(neurons, eq(neurons.id, synapses.targetNeuronId))
        .where(eq(synapses.sourceNeuronId, id));

    const incoming = await db
        .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, source: neurons })
        .from(synapses)
        .innerJoin(neurons, eq(neurons.id, synapses.sourceNeuronId))
        .where(eq(synapses.targetNeuronId, id));

    return { neuron, outgoing, incoming };
}
