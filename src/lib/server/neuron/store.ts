import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema, type Neuron, type NeuronFrontmatter } from '#lib/neuron/schema';

export const NEURONS_DIR = path.resolve(process.cwd(), 'content/neurons');

function filePathFor(id: string) {
    return path.join(NEURONS_DIR, `${id}.md`);
}

export async function listNeuronFiles(): Promise<string[]> {
    await mkdir(NEURONS_DIR, { recursive: true });
    const entries = await readdir(NEURONS_DIR);
    return entries.filter((entry) => entry.endsWith('.md'));
}

export async function readNeuronFile(fileName: string): Promise<Neuron> {
    const raw = await readFile(path.join(NEURONS_DIR, fileName), 'utf-8');
    const parsed = matter(raw);
    const frontmatter = neuronFrontmatterSchema.parse(parsed.data);

    return { ...frontmatter, body: parsed.content.trim() };
}

export async function readAllNeurons(): Promise<Neuron[]> {
    const files = await listNeuronFiles();
    return Promise.all(files.map(readNeuronFile));
}

export async function writeNeuron(frontmatter: NeuronFrontmatter, body: string): Promise<void> {
    await mkdir(NEURONS_DIR, { recursive: true });
    const content = matter.stringify(`${body}\n`, frontmatter);
    await writeFile(filePathFor(frontmatter.id), content, 'utf-8');
}

export function createNeuronId(): string {
    return randomUUID();
}
