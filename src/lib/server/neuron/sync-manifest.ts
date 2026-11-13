import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { CONTENT_DIR } from './storage';
import { readRawSyncFile, readSyncFile, syncPath } from './sync-files';
import { selectSyncPaths } from './sync-scope';
import { syncEntrySchema } from './sync-validation';

export async function syncManifest(offset = 0, limit = Infinity, regions: string[] = []) {
    const names: string[] = [];

    async function visit(relative: string) {
        let children;

        try {
            children = await readdir(path.join(CONTENT_DIR, relative), { withFileTypes: true });
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }

            throw cause;
        }

        for (const child of children) {
            const name = relative ? `${relative}/${child.name}` : child.name;

            if (child.isSymbolicLink()) {
                throw new Error('Invalid symbolic link in sync storage.');
            }

            if (child.isDirectory()) {
                if (/^(neurons|regions|sources|history)(\/|$)/.test(name)) {
                    await visit(name);
                }
            } else {
                try {
                    syncPath(name);
                } catch {
                    continue;
                }

                names.push(name);
            }
        }
    }

    await visit('');
    const scoped = await selectSyncPaths(names, regions, readRawSyncFile);
    const projected = new Map<string, Awaited<ReturnType<typeof readSyncFile>>>();

    for (const name of ['regions.json', 'operations.jsonl']) {
        if (scoped.includes(name)) {
            projected.set(name, await readSyncFile(name, regions));
        }
    }

    const visible = scoped.filter((name) => !projected.has(name) || projected.get(name));
    const entries: z.infer<typeof syncEntrySchema>[] = [];

    for (const name of visible.sort().slice(offset, offset + limit)) {
        const file = projected.has(name) ? projected.get(name) : await readSyncFile(name, regions);

        if (file) {
            entries.push({ path: name, revision: file.revision });
        }
    }

    return entries;
}
