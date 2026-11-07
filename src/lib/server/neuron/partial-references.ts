import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { DATA_DIR } from '../data-dir';
import { atomicWrite } from './storage';

export const partialReferenceSchema = z.object({
    neurons: z.array(z.string()),
    regions: z.array(z.string()),
});
const referencesSchema = z.record(z.string(), partialReferenceSchema);
const file = path.join(DATA_DIR, 'sync', 'references.json');
export type PartialReferences = z.infer<typeof referencesSchema>;

export async function readPartialReferences(): Promise<PartialReferences> {
    try {
        return referencesSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return {};
        }
        throw cause;
    }
}

export async function writePartialReferences(references: PartialReferences) {
    await atomicWrite(file, JSON.stringify(references, null, 2) + '\n');
}

export async function recordPartialReferences(id: string, neurons: string[], regions: string[]) {
    const references = await readPartialReferences();
    references[id] = { neurons: [...new Set(neurons)], regions: [...new Set(regions)] };
    await writePartialReferences(references);
}
