import { mkdirSync } from 'node:fs';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { DATABASE_URL, DATA_DIR } from '../data-dir';
import * as schema from './schema';

export function createDb() {
    mkdirSync(DATA_DIR, { recursive: true });
    const client = createClient({ url: DATABASE_URL });

    return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
