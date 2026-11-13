import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { CONTENT_DIR, fingerprint, safeId } from './storage';

export async function readNeuronHistory(id: string, revision?: string) {
    const directory = path.join(CONTENT_DIR, 'history', safeId(id));

    if (revision) {
        if (!/^[a-f0-9]{64}$/.test(revision)) {
            throw new Error('Invalid revision');
        }

        const raw = await readFile(path.join(directory, `${revision}.md`), 'utf8');

        if (fingerprint(raw) !== revision) {
            throw new Error('Revision integrity failure');
        }

        return { id, revision, raw };
    }

    try {
        return {
            id,
            revisions: (await readdir(directory))
                .filter((file) => /^[a-f0-9]{64}\.md$/.test(file))
                .map((file) => file.slice(0, -3)),
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { id, revisions: [] };
        }

        throw error;
    }
}
