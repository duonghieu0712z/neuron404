import type { ReviewView } from '#lib/neuron/review';
import type { Region } from '#lib/neuron/schema';
import type { Db } from '#lib/server/db/client';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import { regionIdSchema } from '#lib/neuron/schema';
import { createDb } from '#lib/server/db/client';
import { readRegionReviews } from '#lib/server/maintenance/reports';

import { readIndexSnapshots, withIndexedStore, type IndexSnapshot } from './indexed-store';
import { INDEX_RECHECK_MS, synchronizeIndexUnlocked } from './indexer';
import { readRegions } from './regions';
import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from './storage';

const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const membersSchema = z.record(z.string(), revisionSchema);
const metadataSchema = z.object({
    region: regionIdSchema,
    updated: z.string(),
    members: membersSchema,
});
const inputSchema = z.object({
    body: z.string().trim().min(1),
    expectedRevision: revisionSchema.nullable(),
    memberRevisions: membersSchema,
});

function overviewPath(id: string) {
    return path.join(CONTENT_DIR, 'regions', `${regionIdSchema.parse(id)}.md`);
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
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export interface RegionOverview {
    region: Region;
    body: string;
    revision: string | null;
    updated: string | null;
    memberRevisions: Record<string, string>;
    stale: boolean;
    neurons: { id: string; title: string }[];
    reviews: ReviewView[];
}

export async function readRegionOverview(
    id: string,
    snapshots?: IndexSnapshot[],
    db?: Db,
): Promise<RegionOverview> {
    regionIdSchema.parse(id);
    const region = (await readRegions()).find((item) => item.id === id);
    if (!region) {
        throw new Error(`Unknown region: ${id}`);
    }
    if (!snapshots) {
        if (!db) {
            return withIndexedStore((store) => readRegionOverview(id, undefined, store));
        }
        snapshots = await readIndexSnapshots(db, { region: id });
    }
    const members = snapshots.filter(
        ({ neuron }) => neuron.lifecycle === 'active' && neuron.regions.includes(id),
    );
    const memberRevisions = Object.fromEntries(
        members.map(({ neuron, revision }) => [neuron.id, revision]),
    );
    const raw = await readRaw(id);
    const parsed = raw === null ? null : matter(raw, {});
    const metadata = parsed ? metadataSchema.parse(parsed.data) : null;
    if (metadata && metadata.region !== id) {
        throw new Error('Region overview ID mismatch');
    }
    return {
        region,
        body: parsed?.content.trim() ?? '',
        revision: raw === null ? null : fingerprint(raw),
        updated: metadata?.updated ?? null,
        memberRevisions,
        stale: metadata !== null && !sameMembers(metadata.members, memberRevisions),
        neurons: members.map(({ neuron }) => ({ id: neuron.id, title: neuron.title })),
        reviews: await readRegionReviews(id, db ? undefined : snapshots, db),
    };
}

export async function readRegionSummary(id: string) {
    regionIdSchema.parse(id);
    return withIndexedStore(async (db) => {
        const region = (await readRegions()).find((item) => item.id === id);
        if (!region) {
            throw new Error(`Unknown region: ${id}`);
        }
        const members = await readIndexSnapshots(db, { region: id });
        const raw = await readRaw(id);
        const parsed = raw === null ? null : matter(raw, {});
        const metadata = parsed ? metadataSchema.parse(parsed.data) : null;
        if (metadata && metadata.region !== id) {
            throw new Error('Region overview ID mismatch');
        }
        return {
            region,
            body: parsed?.content.trim() ?? '',
            revision: raw === null ? null : fingerprint(raw),
            updated: metadata?.updated ?? null,
            memberCount: members.length,
            stale:
                metadata !== null &&
                !sameMembers(
                    metadata.members,
                    Object.fromEntries(
                        members.map(({ neuron, revision }) => [neuron.id, revision]),
                    ),
                ),
        };
    });
}

export async function writeRegionOverviewUnlocked(id: string, payload: unknown) {
    const db = createDb();
    try {
        await synchronizeIndexUnlocked(db, false, INDEX_RECHECK_MS);
        return await writeIndexedOverview(db, id, payload);
    } finally {
        db.$client.close();
    }
}

async function writeIndexedOverview(db: Db, id: string, payload: unknown) {
    const input = inputSchema.parse(payload);
    const current = await readRegionOverview(id, undefined, db);
    if (current.revision !== input.expectedRevision) {
        throw new Error('Region overview revision conflict. Read region:read before retrying.');
    }
    if (!sameMembers(current.memberRevisions, input.memberRevisions)) {
        throw new Error(
            'Region members changed. Read the affected neurons and refresh the overview.',
        );
    }
    const citations = [...input.body.matchAll(/\]\(neuron:([a-zA-Z0-9_-]+)\)/g)];
    if (current.neurons.length && !citations.length) {
        throw new Error(
            'A Region overview must cite supporting neurons with Markdown neuron: links.',
        );
    }
    for (const match of citations) {
        if (!Object.hasOwn(current.memberRevisions, match[1])) {
            throw new Error(`Overview citation is not a member of this Region: ${match[1]}`);
        }
    }
    const previous = await readRaw(id);
    const history = path.join(CONTENT_DIR, 'history', 'region-overviews', id);
    if (previous !== null) {
        await atomicWrite(path.join(history, `${fingerprint(previous)}.md`), previous, true);
    }
    const raw = matter.stringify(`${input.body}\n`, {
        region: id,
        updated: new Date().toISOString(),
        members: input.memberRevisions,
    });
    await atomicWrite(overviewPath(id), raw);
    await atomicWrite(path.join(history, `${fingerprint(raw)}.md`), raw, true);
    return readRegionOverview(id, undefined, db);
}

export async function writeRegionOverview(id: string, payload: unknown) {
    return withStorageLock(() => writeRegionOverviewUnlocked(id, payload));
}
