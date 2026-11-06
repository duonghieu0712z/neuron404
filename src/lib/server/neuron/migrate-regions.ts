import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema, regionCatalogSchema } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint, markIndexDirty, withStorageLock } from './storage';
import { archiveNeuron, listNeuronFiles } from './store';

interface Change {
    file: string;
    before: string | null;
    after: string | null;
}

interface Migration {
    completed: boolean;
    changes: Change[];
}

async function readOptional(file: string) {
    try {
        return await readFile(path.join(CONTENT_DIR, file), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function prepareChanges() {
    const changes: Change[] = [];
    const legacy = await readOptional('topics.json');
    const current = await readOptional('regions.json');
    if (legacy !== null) {
        const { topics, ...rest } = JSON.parse(legacy);
        const catalog = { ...rest, regions: topics };
        regionCatalogSchema.parse(catalog);
        if (current !== null && !isDeepStrictEqual(JSON.parse(current), catalog)) {
            throw new Error('Conflicting Region catalogs. Resolve them before migrating.');
        }
        if (current === null) {
            changes.push({
                file: 'regions.json',
                before: null,
                after: `${JSON.stringify(catalog, null, 4)}\n`,
            });
        }
        changes.push({ file: 'topics.json', before: legacy, after: null });
    }
    const catalog = regionCatalogSchema.parse(
        JSON.parse(
            current ??
                changes.find((item) => item.file === 'regions.json')?.after ??
                '{"regions":[]}',
        ),
    );
    const regionIds = new Set(catalog.regions.map((region) => region.id));
    const revisions = new Map<string, { before: string; after: string }>();
    for (const name of await listNeuronFiles()) {
        const file = `neurons/${name}`;
        const before = (await readOptional(file))!;
        const parsed = matter(before);
        const data = { ...parsed.data };
        let after = before;
        if (Object.hasOwn(data, 'topics')) {
            if (Object.hasOwn(data, 'regions')) {
                throw new Error(`Both membership keys exist in ${file}. Resolve before migrating.`);
            }
            data.regions = data.topics;
            delete data.topics;
            const header = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/.exec(before);
            if (!header) {
                throw new Error(`Unsupported frontmatter in ${file}`);
            }
            const renamed = header[0].replace(/^(?:topics|'topics'|"topics")(?=\s*:)/m, 'regions');
            if (renamed === header[0]) {
                throw new Error(`Cannot safely rename membership in ${file}`);
            }
            after = renamed + before.slice(header[0].length);
            if (!isDeepStrictEqual(matter(after).data, data)) {
                throw new Error(`Unexpected frontmatter change in ${file}`);
            }
        }
        const neuron = neuronFrontmatterSchema.parse(data);
        if (neuron.id !== name.slice(0, -3)) {
            throw new Error(`Neuron ID mismatch in ${file}`);
        }
        for (const id of neuron.regions) {
            if (!regionIds.has(id)) {
                throw new Error(`Unknown Region ${id} in ${file}`);
            }
        }
        if (after !== before) {
            changes.push({ file, before, after });
            revisions.set(neuron.id, { before: fingerprint(before), after: fingerprint(after) });
        }
    }
    for (const region of catalog.regions) {
        const file = `regions/${region.id}.md`;
        const before = await readOptional(file);
        if (before === null) {
            continue;
        }
        const parsed = matter(before);
        const header = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/.exec(before);
        if (!header) {
            throw new Error(`Unsupported frontmatter in ${file}`);
        }
        let updatedHeader = header[0];
        for (const [id, revision] of revisions) {
            if (parsed.data.members?.[id] === revision.before) {
                updatedHeader = updatedHeader.replaceAll(revision.before, revision.after);
            }
        }
        const after = updatedHeader + before.slice(header[0].length);
        if (after !== before) {
            changes.push({ file, before, after });
        }
    }
    return changes;
}

export async function migrateRegionStorage() {
    return withStorageLock(async () => {
        const receipt = 'history/storage-migrations/regions.json';
        const saved = await readOptional(receipt);
        const migration: Migration =
            saved === null
                ? { completed: false, changes: await prepareChanges() }
                : JSON.parse(saved);
        if (migration.completed || !migration.changes.length) {
            return { migrated: 0 };
        }
        for (const change of migration.changes) {
            const current = await readOptional(change.file);
            if (current !== change.before && current !== change.after) {
                throw new Error(`Migration revision conflict: ${change.file}`);
            }
        }
        if (saved === null) {
            await atomicWrite(path.join(CONTENT_DIR, receipt), JSON.stringify(migration));
        }
        await markIndexDirty();
        for (const { file, before, after } of migration.changes) {
            if (file.startsWith('neurons/')) {
                const id = path.basename(file, '.md');
                if (before !== null) {
                    await archiveNeuron(id, before);
                }
                if (after !== null) {
                    await archiveNeuron(id, after);
                }
            } else if (file.startsWith('regions/') && before !== null) {
                const history = path.join(
                    CONTENT_DIR,
                    'history',
                    'region-overviews',
                    path.basename(file, '.md'),
                );
                await atomicWrite(path.join(history, `${fingerprint(before)}.md`), before, true);
                if (after !== null) {
                    await atomicWrite(path.join(history, `${fingerprint(after)}.md`), after, true);
                }
            }
            if (after === null) {
                await rm(path.join(CONTENT_DIR, file), { force: true });
            } else {
                await atomicWrite(path.join(CONTENT_DIR, file), after);
            }
        }
        migration.completed = true;
        await atomicWrite(path.join(CONTENT_DIR, receipt), JSON.stringify(migration));
        return { migrated: migration.changes.length };
    });
}
