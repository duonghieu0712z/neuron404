import './env';

import { mkdir } from 'node:fs/promises';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { createDb } from '#lib/server/db/client';
import { synchronizeIndex } from '#lib/server/neuron/indexer';
import { NEURONS_DIR } from '#lib/server/neuron/store';

await mkdir(NEURONS_DIR, { recursive: true });
const db = createDb();
try {
    await migrate(db, { migrationsFolder: './drizzle' });
    const result = await synchronizeIndex(db);
    console.log(`Storage ready: ${result.neuronCount} neurons, ${result.synapseCount} synapses.`);
} finally {
    db.$client.close();
}
