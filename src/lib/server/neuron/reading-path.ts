import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { regionIdSchema } from '#lib/neuron/schema';

import { readRegions } from './regions';
import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from './storage';
import { readAllNeurons } from './store';

const pathSchema = z.object({
    introduction: z.string().max(20_000),
    steps: z.array(z.object({ id: z.string().min(1), purpose: z.string().max(2000) })).max(500),
});
const writeSchema = pathSchema.extend({
    expectedRevision: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
});

function filePath(id: string) {
    return path.join(CONTENT_DIR, 'reading-paths', `${regionIdSchema.parse(id)}.json`);
}

export async function readReadingPath(id: string) {
    try {
        const raw = await readFile(filePath(id), 'utf8');

        return { ...pathSchema.parse(JSON.parse(raw)), revision: fingerprint(raw) };
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw cause;
        }

        return { introduction: '', steps: [], revision: null };
    }
}

export async function writeReadingPath(id: string, payload: unknown) {
    const { expectedRevision, ...input } = writeSchema.parse(payload);

    return withStorageLock(async () => {
        if (!(await readRegions()).some((region) => region.id === id)) {
            throw new Error('Unknown region.');
        }

        const current = await readReadingPath(id);

        if (current.revision !== expectedRevision) {
            throw new Error('Reading path changed. Reload before saving.');
        }

        const members = new Set(
            (await readAllNeurons())
                .filter((neuron) => neuron.lifecycle === 'active' && neuron.regions.includes(id))
                .map((neuron) => neuron.id),
        );

        if (new Set(input.steps.map((step) => step.id)).size !== input.steps.length) {
            throw new Error('Reading path contains duplicate neurons.');
        }

        if (input.steps.some((step) => !members.has(step.id))) {
            throw new Error('Reading path must use active neurons in this region.');
        }

        if (current.revision) {
            await atomicWrite(
                path.join(CONTENT_DIR, 'history', 'reading-paths', id, `${current.revision}.json`),
                await readFile(filePath(id), 'utf8'),
                true,
            );
        }

        await atomicWrite(filePath(id), JSON.stringify(input));

        return readReadingPath(id);
    });
}
