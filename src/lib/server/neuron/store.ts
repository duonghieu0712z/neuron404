import { randomUUID } from 'node:crypto';
import { appendFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema, type Neuron, type NeuronFrontmatter } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint, safeId } from './storage';

export const NEURONS_DIR = path.join(CONTENT_DIR, 'neurons');

export function filePathFor(id: string) {
    return path.join(NEURONS_DIR, `${safeId(id)}.md`);
}

export async function listNeuronFiles(): Promise<string[]> {
    try {
        return (await readdir(NEURONS_DIR)).filter((entry) => entry.endsWith('.md')).sort();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
}

export async function readNeuronSnapshot(id: string) {
    const raw = await readFile(filePathFor(id), 'utf8');
    const parsed = matter(raw);
    const frontmatter = neuronFrontmatterSchema.parse(parsed.data);
    if (frontmatter.id !== id) throw new Error(`Neuron ID does not match filename: ${id}`);
    return {
        raw,
        revision: fingerprint(raw),
        neuron: { ...frontmatter, body: parsed.content.trim() },
    };
}

export async function readNeuronFile(fileName: string): Promise<Neuron> {
    if (!fileName.endsWith('.md')) throw new Error('Expected a Markdown neuron');
    return (await readNeuronSnapshot(fileName.slice(0, -3))).neuron;
}

export async function readAllNeurons(): Promise<Neuron[]> {
    return Promise.all((await listNeuronFiles()).map(readNeuronFile));
}

export async function writeNeuron(frontmatter: NeuronFrontmatter, body: string): Promise<void> {
    await atomicWrite(filePathFor(frontmatter.id), matter.stringify(`${body}\n`, frontmatter));
}

export async function archiveNeuron(id: string, raw: string) {
    const revision = fingerprint(raw);
    const directory = path.join(CONTENT_DIR, 'history', safeId(id));
    const filePath = path.join(directory, `${revision}.md`);
    await atomicWrite(filePath, raw, true);
    if ((await readFile(filePath, 'utf8')) !== raw)
        throw new Error(`Revision integrity failure: ${id}`);
    return revision;
}

export async function recordOperation(
    operation: 'create' | 'update',
    id: string,
    revision: string,
    previousRevision?: string,
) {
    await appendFile(
        path.join(CONTENT_DIR, 'operations.jsonl'),
        JSON.stringify({
            operation,
            id,
            revision,
            previousRevision,
            at: new Date().toISOString(),
        }) + '\n',
        { mode: 0o600 },
    );
}

export function createNeuronId(): string {
    return randomUUID();
}
