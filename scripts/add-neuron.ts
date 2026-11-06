import './env';

import path from 'node:path';
import process from 'node:process';

import { classifiedNeuronInputSchema } from '#lib/neuron/schema';
import { createDb } from '#lib/server/db/client';
import { createNeuron } from '#lib/server/neuron/create';
import { NEURONS_DIR } from '#lib/server/neuron/store';

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8');
}

const raw = await readStdin();
if (!raw.trim()) {
    console.error('Expected a JSON neuron payload on stdin, e.g.:');
    console.error(
        JSON.stringify(
            {
                title: 'Example title',
                body: 'Example content.',
                grounding: 'inferred',
                endorsement: 'unreviewed',
                provenance: 'original',
                regions: ['region-id'],
                synapses: [],
            },
            null,
            2,
        ),
    );
    process.exit(1);
}

const payload: unknown = JSON.parse(raw);
const parsed = classifiedNeuronInputSchema.safeParse(payload);

if (!parsed.success) {
    console.error('Invalid neuron payload:');
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
}

const db = createDb();
const neuron = await createNeuron(db, parsed.data);

console.log(
    JSON.stringify(
        {
            id: neuron.id,
            title: neuron.title,
            revision: neuron.revision,
            regions: neuron.regions,
            filePath: path.join(NEURONS_DIR, `${neuron.id}.md`),
        },
        null,
        2,
    ),
);
