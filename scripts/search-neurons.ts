import process from 'node:process';

import { createDb } from '#lib/server/db/client';
import { searchNeurons } from '#lib/server/neuron/search';

import './env';

const query = process.argv[2];
if (!query) {
    console.error('Usage: neuron:search "<query>" [limit]');
    process.exit(1);
}

const limit = Number(process.argv[3]) || 10;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const db = createDb(databaseUrl);
const results = await searchNeurons(db, query, limit);

if (results.length === 0) {
    console.log('No matches.');
    process.exit(0);
}

for (const result of results) {
    console.log(`${result.id}  ${result.title}`);
    console.log(`  ${result.snippet}`);
}
