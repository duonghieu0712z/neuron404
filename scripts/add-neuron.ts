import process from 'node:process';

import { newNeuronInputSchema } from '#lib/neuron/schema';
import { createDb } from '#lib/server/db/client';
import { createNeuron } from '#lib/server/neuron/create';

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
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
                synapses: [],
            },
            null,
            2,
        ),
    );
    process.exit(1);
}

const payload: unknown = JSON.parse(raw);
const parsed = newNeuronInputSchema.safeParse(payload);

if (!parsed.success) {
    console.error('Invalid neuron payload:');
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const db = createDb(databaseUrl);
const neuron = await createNeuron(db, parsed.data);

console.log(
    JSON.stringify(
        { id: neuron.id, title: neuron.title, filePath: `content/neurons/${neuron.id}.md` },
        null,
        2,
    ),
);
