import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { topicCatalogSchema } from '#lib/neuron/schema';

import { NEURONS_DIR } from './store';

export async function readTopics() {
    let content: string;
    try {
        content = await readFile(path.join(NEURONS_DIR, '../topics.json'), 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    return topicCatalogSchema.parse(JSON.parse(content)).topics;
}
