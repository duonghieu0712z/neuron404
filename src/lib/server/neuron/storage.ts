import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CONTENT_DIR = path.resolve(import.meta.dirname, '../../../../content');

export function fingerprint(content: string) {
    return createHash('sha256').update(content).digest('hex');
}

export function safeId(id: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('Invalid neuron ID');
    return id;
}

export async function atomicWrite(filePath: string, content: string, immutable = false) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
    } finally {
        await handle.close();
    }
    try {
        if (immutable) {
            try {
                await link(temporary, filePath);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            }
        } else await rename(temporary, filePath);
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function withStorageLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(CONTENT_DIR, { recursive: true });
    const lockPath = path.join(CONTENT_DIR, '.write-lock');
    const deadline = Date.now() + 5000;
    let lock;
    while (!lock) {
        try {
            lock = await open(lockPath, 'wx', 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            if (Date.now() >= deadline)
                throw new Error(
                    'Storage is locked. Retry or recover content/.write-lock after a crashed writer.',
                    { cause: error },
                );
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    try {
        await lock.writeFile(
            JSON.stringify({ pid: process.pid, created: new Date().toISOString() }),
        );
        return await action();
    } finally {
        await lock.close();
        await rm(lockPath, { force: true });
    }
}

export async function markIndexDirty() {
    await writeFile(path.join(CONTENT_DIR, '.index-dirty'), '', { mode: 0o600 });
}
