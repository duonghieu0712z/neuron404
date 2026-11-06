import { readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import { topicIdSchema } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from './storage';
import { listNeuronFiles, readNeuronSnapshot } from './store';
import { readTopics } from './topics';

const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const membersSchema = z.record(z.string(), revisionSchema);
const metadataSchema = z.object({
    region: topicIdSchema,
    updated: z.string(),
    members: membersSchema,
});
const inputSchema = z.object({
    body: z.string().trim().min(1),
    expectedRevision: revisionSchema.nullable(),
    memberRevisions: membersSchema,
});

function overviewPath(id: string) {
    return path.join(CONTENT_DIR, 'regions', `${topicIdSchema.parse(id)}.md`);
}

function sameMembers(a: Record<string, string>, b: Record<string, string>) {
    return (
        Object.keys(a).length === Object.keys(b).length &&
        Object.entries(a).every(([id, revision]) => b[id] === revision)
    );
}

async function readRaw(id: string) {
    try {
        return await readFile(overviewPath(id), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
}

export async function readRegionOverview(id: string) {
    topicIdSchema.parse(id);
    const region = (await readTopics()).find((item) => item.id === id);
    if (!region) throw new Error(`Unknown region: ${id}`);
    const snapshots = await Promise.all(
        (await listNeuronFiles()).map((name) => readNeuronSnapshot(name.slice(0, -3))),
    );
    const members = snapshots.filter(({ neuron }) => neuron.topics.includes(id));
    const memberRevisions = Object.fromEntries(
        members.map(({ neuron, revision }) => [neuron.id, revision]),
    );
    const raw = await readRaw(id);
    const parsed = raw === null ? null : matter(raw);
    const metadata = parsed ? metadataSchema.parse(parsed.data) : null;
    if (metadata && metadata.region !== id) throw new Error('Region overview ID mismatch');
    return {
        region,
        body: parsed?.content.trim() ?? '',
        revision: raw === null ? null : fingerprint(raw),
        updated: metadata?.updated ?? null,
        memberRevisions,
        stale: metadata !== null && !sameMembers(metadata.members, memberRevisions),
        neurons: members.map(({ neuron }) => ({ id: neuron.id, title: neuron.title })),
    };
}

export type RegionOverview = Awaited<ReturnType<typeof readRegionOverview>>;

export async function writeRegionOverview(id: string, payload: unknown) {
    const input = inputSchema.parse(payload);
    return withStorageLock(async () => {
        const current = await readRegionOverview(id);
        if (current.revision !== input.expectedRevision)
            throw new Error('Region overview revision conflict. Read region:read before retrying.');
        if (!sameMembers(current.memberRevisions, input.memberRevisions))
            throw new Error(
                'Region members changed. Read the affected neurons and refresh the overview.',
            );
        const citations = [...input.body.matchAll(/\]\(neuron:([a-zA-Z0-9_-]+)\)/g)];
        if (current.neurons.length && !citations.length)
            throw new Error(
                'A Region overview must cite supporting neurons with Markdown neuron: links.',
            );
        for (const match of citations)
            if (!Object.hasOwn(current.memberRevisions, match[1]))
                throw new Error(`Overview citation is not a member of this Region: ${match[1]}`);
        const previous = await readRaw(id);
        const history = path.join(CONTENT_DIR, 'history', 'region-overviews', id);
        if (previous !== null)
            await atomicWrite(path.join(history, `${fingerprint(previous)}.md`), previous, true);
        const raw = matter.stringify(`${input.body}\n`, {
            region: id,
            updated: new Date().toISOString(),
            members: input.memberRevisions,
        });
        await atomicWrite(overviewPath(id), raw);
        await atomicWrite(path.join(history, `${fingerprint(raw)}.md`), raw, true);
        return readRegionOverview(id);
    });
}
