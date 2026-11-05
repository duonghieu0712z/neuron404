import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { CONTENT_DIR } from '#lib/server/neuron/storage';

export async function GET() {
    const headers = { 'Cache-Control': 'no-store' };
    try {
        await access(CONTENT_DIR, constants.R_OK | constants.W_OK);
        await db.run(sql`SELECT 1`);
        return json({ status: 'ok' }, { headers });
    } catch {
        return json({ status: 'error' }, { status: 503, headers });
    }
}
