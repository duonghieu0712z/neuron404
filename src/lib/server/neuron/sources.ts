import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { sourceInputSchema } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint } from './storage';

function sourcePath(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) {
        throw new Error('Invalid source ID');
    }
    return path.join(CONTENT_DIR, 'sources', `${id}.json`);
}

export async function readSource(id: string) {
    const stored = JSON.parse(await readFile(sourcePath(id), 'utf8'));
    const source = sourceInputSchema.parse(stored.source);
    if (fingerprint(JSON.stringify(source)) !== id) {
        throw new Error(`Source integrity failure: ${id}`);
    }
    return { id, capturedAt: String(stored.capturedAt), source };
}

export async function saveSource(input: unknown) {
    const source = sourceInputSchema.parse(input);
    const id = fingerprint(JSON.stringify(source));
    await atomicWrite(
        sourcePath(id),
        JSON.stringify({ source, capturedAt: new Date().toISOString() }, null, 2) + '\n',
        true,
    );
    return readSource(id);
}
