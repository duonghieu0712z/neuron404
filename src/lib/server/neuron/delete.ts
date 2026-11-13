import type { Db } from '#lib/server/db/client';

import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { synchronizeIndexUnlocked } from './indexer';
import { CONTENT_DIR, markIndexDirty, withStorageLock } from './storage';
import { filePathFor, readAllNeurons, readNeuronSnapshot } from './store';

const inputSchema = z.object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    purgeHistory: z.boolean().default(false),
});

export async function deleteNeuron(db: Db, id: string, input: unknown) {
    const { expectedRevision, purgeHistory } = inputSchema.parse(input);

    return withStorageLock(async () => {
        const current = await readNeuronSnapshot(id);
        if (current.revision !== expectedRevision) {
            throw new Error('Revision conflict. Read the current neuron before deleting it.');
        }

        const references = (await readAllNeurons())
            .filter(
                (neuron) =>
                    neuron.id !== id &&
                    (neuron.synapses.some((edge) => edge.target === id) ||
                        neuron.supersededBy === id ||
                        neuron.body.includes(`neuron:${id}`)),
            )
            .map((neuron) => neuron.id);

        const directory = path.join(CONTENT_DIR, 'regions');
        const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        });
        for (const file of files.filter((name) => name.endsWith('.md'))) {
            const body = await readFile(path.join(directory, file), 'utf8');
            if (body.includes(`neuron:${id}`)) {
                references.push(`region:${file.slice(0, -3)}`);
            }
        }

        if (references.length) {
            throw new Error(`Neuron is still referenced by: ${references.join(', ')}`);
        }

        await markIndexDirty();
        await rm(filePathFor(id));
        if (purgeHistory) {
            await rm(path.join(CONTENT_DIR, 'history', id), { recursive: true, force: true });
        }
        await synchronizeIndexUnlocked(db);

        return { id, revision: current.revision, deleted: true, historyDeleted: purgeHistory };
    });
}
