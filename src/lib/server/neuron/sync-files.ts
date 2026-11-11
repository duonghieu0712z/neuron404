import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { readPartialReferences } from './partial-references';
import { CONTENT_DIR, fingerprint } from './storage';
import { projectSyncFile } from './sync-scope';

export function syncPath(relative: string) {
    const id = '[a-zA-Z0-9][a-zA-Z0-9_-]*';
    const hash = '[a-f0-9]{64}';

    const pattern = new RegExp(
        `^(regions\\.json|operations\\.jsonl|neurons/${id}\\.md|regions/${id}\\.md|sources/${hash}\\.json|history/${id}/${hash}\\.md|history/regions/${hash}\\.json|history/region-overviews/${id}/${hash}\\.md)$`,
    );

    if (!pattern.test(relative)) {
        throw new Error('Invalid sync path.');
    }

    return path.join(CONTENT_DIR, ...relative.split('/'));
}

export async function checkedPath(relative: string) {
    const target = syncPath(relative);
    let current = CONTENT_DIR;

    for (const part of ['', ...relative.split('/')]) {
        current = path.join(current, part);

        try {
            const stat = await lstat(current);

            if (stat.isSymbolicLink()) {
                throw new Error('Invalid symbolic link in sync storage.');
            }
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw cause;
            }
        }
    }

    return target;
}

export async function readRawSyncFile(relative: string) {
    const file = await checkedPath(relative);

    try {
        const content = await readFile(file, 'utf8');
        return { path: relative, content, revision: fingerprint(content) };
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw cause;
    }
}

export async function scopedNeuronIds(regions: string[]) {
    let files: string[];

    try {
        files = await readdir(path.join(CONTENT_DIR, 'neurons'));
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Set<string>();
        }

        throw cause;
    }

    const ids = new Set<string>();

    for (const name of files.filter((name) => name.endsWith('.md'))) {
        const file = await readRawSyncFile(`neurons/${name}`);

        if (file) {
            const data = neuronFrontmatterSchema.parse(matter(file.content, {}).data);

            if (data.regions.some((region) => regions.includes(region))) {
                ids.add(data.id);
            }
        }
    }

    return ids;
}

export async function readSyncFile(relative: string, regions: string[] = []) {
    const file = await projectSyncFile(await readRawSyncFile(relative), regions, () =>
        scopedNeuronIds(regions),
    );

    if (file && relative.startsWith('neurons/')) {
        const references = await readPartialReferences();
        return { ...file, partialReferences: references[relative.slice(8, -3)] };
    }

    return file ? { ...file, partialReferences: undefined } : null;
}
