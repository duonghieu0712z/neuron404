import type { PageServerLoad } from './$types';

import { db } from '#lib/server/db';
import { neurons, synapses } from '#lib/server/db/schema';

export const load: PageServerLoad = async () => {
    const nodes = await db.select({ id: neurons.id, title: neurons.title }).from(neurons);
    const edges = await db
        .select({
            kind: synapses.kind,
            source: synapses.sourceNeuronId,
            target: synapses.targetNeuronId,
        })
        .from(synapses);

    return { edges, nodes };
};
