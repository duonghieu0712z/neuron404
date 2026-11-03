import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

export function createDb(url: string) {
    if (!url) throw new Error('DATABASE_URL is not set');

    const client = createClient({ url });

    return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
