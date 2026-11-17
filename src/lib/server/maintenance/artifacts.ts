import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { reviewEvidenceSchema } from '#lib/neuron/review';
import { CONTENT_DIR, atomicWrite, fingerprint } from '#lib/server/neuron/storage';

import { hashSchema, reportSchema } from './report-schema';

export const artifactSchema = z.object({
    version: z.literal(1),
    type: z.enum(['report', 'dispute', 'repair', 'source-check']),
    at: z.string().datetime(),
    neurons: z.record(z.string(), hashSchema),
    sources: z.array(hashSchema),
    regions: z.array(z.string()),
    parents: z.array(hashSchema),
    payload: z.record(z.string(), z.unknown()),
});
export type Artifact = z.infer<typeof artifactSchema> & { id: string };
export const artifactDirectory = path.join(CONTENT_DIR, 'maintenance');

export function validateArtifact(raw: string, id: string): Artifact {
    const stored = JSON.parse(raw);
    const value = artifactSchema.parse(stored);
    if (stored.id !== id || fingerprint(JSON.stringify(value)) !== id) {
        throw new Error('Maintenance artifact integrity failure.');
    }
    if (value.type === 'report') {
        const { id: reportId, ...report } = reportSchema.parse(value.payload);
        if (fingerprint(JSON.stringify(report)) !== reportId) {
            throw new Error('Report integrity failure.');
        }
    }
    if (value.type === 'dispute') {
        z.object({
            dispute: hashSchema,
            action: z.enum(['open', 'comment', 'waiting-evidence', 'resolved', 'dismissed']),
            author: z.string().min(1),
            note: z.string().min(10),
            evidence: z.array(reviewEvidenceSchema),
            report: hashSchema.optional(),
            finding: hashSchema.optional(),
            inputRevision: hashSchema.optional(),
        }).parse(value.payload);
    }
    if (value.type === 'repair') {
        z.object({
            phase: z.enum([
                'stale',
                'incomplete',
                'waiting-evidence',
                'human',
                'prepared',
                'applied',
                'applied-needs-index',
                'conflict',
                'rejected',
                'rolled-back',
            ]),
            proposal: z.string().uuid().optional(),
            neuron: z.string().optional(),
            reason: z.string().optional(),
        }).parse(value.payload);
    }
    if (value.type === 'source-check') {
        z.object({
            original: hashSchema,
            status: z.enum(['requested', 'blocked', 'changed', 'unchanged']),
            snapshot: hashSchema.optional(),
            raw: z.string().max(700000).optional(),
            rawHash: hashSchema.optional(),
        }).parse(value.payload);
    }
    if (
        value.type === 'source-check' &&
        typeof value.payload.raw === 'string' &&
        createHash('sha256').update(Buffer.from(value.payload.raw, 'base64')).digest('hex') !==
            value.payload.rawHash
    ) {
        throw new Error('Raw source response integrity failure.');
    }
    return { id, ...value };
}

export async function saveArtifact(input: z.input<typeof artifactSchema>) {
    const value = artifactSchema.parse(input);
    const id = fingerprint(JSON.stringify(value));
    const artifact = { id, ...value };
    validateArtifact(JSON.stringify(artifact), id);
    await atomicWrite(path.join(artifactDirectory, `${id}.json`), JSON.stringify(artifact), true);
    return artifact;
}

export async function readArtifact(id: string) {
    hashSchema.parse(id);
    return validateArtifact(await readFile(path.join(artifactDirectory, `${id}.json`), 'utf8'), id);
}

export async function listArtifacts(type?: Artifact['type']) {
    let names: string[];
    try {
        names = await readdir(artifactDirectory);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return [];
    }
    const result = [];
    for (const name of names.sort().filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
        const value = await readArtifact(name.slice(0, -5));
        if (!type || value.type === type) {
            result.push(value);
        }
    }
    return result.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export function sourceCheckHeads(checks: Artifact[]) {
    const completed = checks.filter(
        (check) => check.type === 'source-check' && check.payload.status !== 'requested',
    );
    const parents = new Set(completed.flatMap((check) => check.parents));
    return completed.filter((check) => !parents.has(check.id));
}
