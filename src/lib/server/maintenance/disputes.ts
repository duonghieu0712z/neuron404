import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { reviewEvidenceSchema } from '#lib/neuron/review';
import { readSource } from '#lib/server/neuron/sources';
import { CONTENT_DIR, safeId } from '#lib/server/neuron/storage';
import { fingerprint, withStorageLock } from '#lib/server/neuron/storage';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { listArtifacts, saveArtifact } from './artifacts';
import { incompleteContext } from './context';
import { hashSchema } from './report-schema';

export const disputeEventSchema = z.object({
    dispute: hashSchema,
    action: z.enum(['open', 'comment', 'waiting-evidence', 'resolved', 'dismissed']),
    note: z.string().trim().min(10).max(10000),
    author: z.string().trim().min(1).max(200),
    evidence: z.array(reviewEvidenceSchema).max(50),
    report: hashSchema.optional(),
    finding: hashSchema.optional(),
    inputRevision: hashSchema.optional(),
});

export async function readDispute(id: string) {
    hashSchema.parse(id);
    const events = (await listArtifacts('dispute')).filter((event) => event.payload.dispute === id);
    if (!events.length) {
        throw new Error('Dispute not found.');
    }
    const parentIds = new Set(events.flatMap((event) => event.parents));
    const heads = events.filter((event) => !parentIds.has(event.id));
    const missing: string[] = [];
    for (const neuron of new Set(events.flatMap((event) => Object.keys(event.neurons)))) {
        try {
            await readNeuronSnapshot(neuron);
            if (await incompleteContext(neuron)) {
                missing.push(neuron);
            }
        } catch {
            missing.push(neuron);
        }
    }
    for (const event of events) {
        for (const source of event.sources) {
            try {
                await readSource(source);
            } catch {
                missing.push(source);
            }
        }
        for (const [id, revision] of Object.entries(event.neurons)) {
            try {
                if ((await readNeuronSnapshot(id)).revision !== revision) {
                    const archived = await readFile(
                        path.join(CONTENT_DIR, 'history', safeId(id), `${revision}.md`),
                        'utf8',
                    );
                    if (fingerprint(archived) !== revision) {
                        missing.push(`${id}:${revision}`);
                    }
                }
            } catch {
                missing.push(`${id}:${revision}`);
            }
        }
    }
    const known = new Set((await listArtifacts()).map((event) => event.id));
    for (const parent of new Set(events.flatMap((event) => event.parents))) {
        if (!known.has(parent)) {
            missing.push(parent);
        }
    }
    const byId = new Map(events.map((event) => [event.id, event]));
    function stateOf(event: (typeof events)[number], visited = new Set<string>()): string {
        if (visited.has(event.id)) {
            return 'conflict';
        }
        visited.add(event.id);
        if (event.payload.action !== 'comment') {
            return String(event.payload.action);
        }
        const parents = event.parents
            .map((id) => byId.get(id))
            .filter((event) => event !== undefined);
        const states = new Set(parents.map((parent) => stateOf(parent, new Set(visited))));
        return states.size === 1 ? [...states][0] : 'conflict';
    }
    return {
        id,
        status: heads.length === 1 ? stateOf(heads[0]) : 'conflict',
        incomplete: missing.length > 0,
        missing,
        heads: heads.map((event) => event.id),
        events,
    };
}

export async function listDisputes() {
    const ids = [
        ...new Set((await listArtifacts('dispute')).map((event) => String(event.payload.dispute))),
    ];
    return Promise.all(ids.map(readDispute));
}

export async function writeDispute(
    action: 'open' | 'comment' | 'resolve',
    id: string | undefined,
    input: unknown,
) {
    const payload = z
        .object({
            neurons: z.array(z.string()).min(1).max(12),
            note: z.string().trim().min(10).max(10000),
            author: z.string().trim().min(1).max(200),
            evidence: z.array(reviewEvidenceSchema).default([]),
            status: z.enum(['waiting-evidence', 'resolved', 'dismissed']).optional(),
            expectedHeads: z.array(hashSchema).optional(),
        })
        .parse(input);
    return withStorageLock(async () => {
        const snapshots = await Promise.all(payload.neurons.map(readNeuronSnapshot));
        for (const evidence of payload.evidence) {
            const text =
                evidence.kind === 'source'
                    ? (await readSource(evidence.id)).source.content
                    : snapshots.find(({ neuron }) => neuron.id === evidence.id)?.neuron.body;
            if (!text?.includes(evidence.quote)) {
                throw new Error('Invalid dispute evidence quotation.');
            }
        }
        const dispute =
            id ??
            fingerprint(
                JSON.stringify({ neurons: [...payload.neurons].sort(), issue: payload.note }),
            );
        const previous = await readDispute(dispute).catch((error) => {
            if (action === 'open' && error.message === 'Dispute not found.') {
                return null;
            }
            throw error;
        });
        if (action === 'open' && previous) {
            const duplicate = previous.events.find(
                (event) =>
                    event.payload.action === 'open' &&
                    event.payload.note === payload.note &&
                    event.payload.author === payload.author &&
                    JSON.stringify(event.payload.evidence) === JSON.stringify(payload.evidence),
            );
            if (duplicate) {
                return duplicate;
            }
        }
        if (
            previous &&
            JSON.stringify([...(payload.expectedHeads ?? [])].sort()) !==
                JSON.stringify([...previous.heads].sort())
        ) {
            throw new Error('Dispute changed. Supply its current expectedHeads.');
        }
        if (action === 'resolve' && previous?.incomplete) {
            throw new Error('Dispute context is incomplete.');
        }
        const event = disputeEventSchema.parse({
            dispute,
            action: action === 'resolve' ? (payload.status ?? 'resolved') : action,
            note: payload.note,
            author: payload.author,
            evidence: payload.evidence,
        });
        return saveArtifact({
            version: 1,
            type: 'dispute',
            at: new Date().toISOString(),
            neurons: Object.fromEntries(
                snapshots.map(({ neuron, revision }) => [neuron.id, revision]),
            ),
            regions: [...new Set(snapshots.flatMap(({ neuron }) => neuron.regions))],
            sources: [
                ...new Set(
                    payload.evidence
                        .filter((item) => item.kind === 'source')
                        .map((item) => item.id),
                ),
            ],
            parents: previous?.heads ?? [],
            payload: event,
        });
    });
}
