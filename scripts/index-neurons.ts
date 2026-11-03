import process from 'node:process';

import { createDb } from '#lib/server/db/client';
import { rebuildIndex } from '#lib/server/neuron/indexer';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const db = createDb(databaseUrl);
const result = await rebuildIndex(db);

console.log(`Indexed ${result.neuronCount} neuron(s), ${result.synapseCount} synapse(s).`);
