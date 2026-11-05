import process from 'node:process';

import { createDb } from '#lib/server/db/client';
import { rebuildIndex, synchronizeIndex } from '#lib/server/neuron/indexer';

import './env';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const db = createDb(databaseUrl);
const result = await (process.argv.includes('--rebuild') ? rebuildIndex(db) : synchronizeIndex(db));

console.log(
    `Indexed ${result.neuronCount} neuron(s), ${result.synapseCount} synapse(s); ${result.updated} updated, ${result.removed} removed.`,
);
