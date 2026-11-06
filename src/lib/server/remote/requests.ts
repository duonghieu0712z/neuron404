import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { DATA_DIR } from '#lib/server/data-dir';
import { atomicWrite, fingerprint } from '#lib/server/neuron/storage';

export interface CommandResponse {
    status: number;
    body: unknown;
}

const receiptSchema = z.discriminatedUnion('state', [
    z.object({ state: z.literal('pending'), digest: z.string(), createdAt: z.string() }),
    z.object({
        state: z.literal('complete'),
        digest: z.string(),
        status: z.number(),
        body: z.unknown(),
    }),
]);

/** Reserve before executing. An interrupted write is never silently executed again. */
export async function executeOnce(
    key: string,
    input: unknown,
    action: () => Promise<CommandResponse>,
): Promise<CommandResponse> {
    const directory = path.join(DATA_DIR, 'remote', 'requests');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${fingerprint(key)}.json`);
    const digest = fingerprint(JSON.stringify(input));
    let handle;
    try {
        handle = await open(file, 'wx', 0o600);
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw cause;
        }
        const existing = receiptSchema.safeParse(
            await readFile(file, 'utf8')
                .then((raw) => {
                    try {
                        return JSON.parse(raw);
                    } catch {
                        return null;
                    }
                })
                .catch(() => null),
        );
        if (!existing.success || existing.data.state === 'pending') {
            return {
                status: 409,
                body: {
                    error: 'Request is in progress or its outcome is uncertain. Inspect the store before retrying with a new request ID.',
                    requestId: key,
                },
            };
        }
        if (existing.data.digest !== digest) {
            return {
                status: 409,
                body: {
                    error: 'Request ID was already used with different input.',
                    requestId: key,
                },
            };
        }
        return { status: existing.data.status, body: existing.data.body };
    }
    try {
        await handle.writeFile(
            JSON.stringify({ state: 'pending', digest, createdAt: new Date().toISOString() }),
        );
        await handle.sync();
    } finally {
        await handle.close();
    }

    const result = await action();
    await atomicWrite(file, JSON.stringify({ state: 'complete', digest, ...result }));
    return result;
}
