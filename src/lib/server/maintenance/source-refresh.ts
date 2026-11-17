import { createHash } from 'node:crypto';

import { readSource, saveSource } from '#lib/server/neuron/sources';
import { withStorageLock } from '#lib/server/neuron/storage';

import { listArtifacts, saveArtifact, sourceCheckHeads } from './artifacts';
import { markReviewDirtyUnlocked } from './dirty';
import { scanNeurons } from './scanner';
import { extractSource, fetchPublicSource, readRegisteredSource } from './source-fetch';

export {
    extractSource,
    fetchPublicSource,
    publicAddress,
    readRegisteredSource,
} from './source-fetch';

async function saveSourceCheck(input: Parameters<typeof saveArtifact>[0]) {
    return withStorageLock(async () => {
        const artifact = await saveArtifact(input);
        if (input.payload.status === 'changed') {
            for (const id of Object.keys(input.neurons)) {
                await markReviewDirtyUnlocked(id);
            }
        }
        return artifact;
    });
}

export async function refreshSource(id: string, signal?: AbortSignal) {
    const original = await readSource(id);
    const linked = (await scanNeurons()).snapshots.filter(
        ({ neuron }) => neuron.sources.includes(id) || neuron.body.includes(original.source.uri),
    );
    const history = (await listArtifacts('source-check')).filter(
        (item) => item.payload.original === id,
    );
    const previous = history.at(-1);
    const validators: Record<string, string> = {};
    if (typeof previous?.payload.etag === 'string') {
        validators['If-None-Match'] = previous.payload.etag;
    }
    if (typeof previous?.payload.lastModified === 'string') {
        validators['If-Modified-Since'] = previous.payload.lastModified;
    }
    const parents = sourceCheckHeads(history).map((item) => item.id);
    const base = {
        version: 1 as const,
        type: 'source-check' as const,
        at: new Date(
            Math.max(Date.now(), previous ? Date.parse(previous.at) + 1 : 0),
        ).toISOString(),
        neurons: Object.fromEntries(linked.map(({ neuron, revision }) => [neuron.id, revision])),
        sources: [
            ...new Set([
                id,
                ...(previous?.sources ?? []),
                ...(typeof previous?.payload.snapshot === 'string'
                    ? [previous.payload.snapshot]
                    : []),
            ]),
        ],
        regions: [...new Set(linked.flatMap(({ neuron }) => neuron.regions))],
        parents,
    };
    try {
        const response = /^https?:\/\//.test(original.source.uri)
            ? await fetchPublicSource(original.source.uri, validators, signal)
            : await readRegisteredSource(original.source.uri);
        if (response.status === 304) {
            if (!previous?.payload.snapshot) {
                throw new Error('Source returned 304 without a previous successful snapshot.');
            }
            return saveSourceCheck({
                ...base,
                sources: [...new Set([...base.sources, ...previous.sources])],
                payload: {
                    ...previous.payload,
                    status: 'unchanged',
                    checkedAt: base.at,
                    explanation: 'HTTP 304 describes the resource, not the truth of a neuron.',
                },
            });
        }
        if (response.status !== 200) {
            throw new Error(`Source returned HTTP ${response.status}.`);
        }
        const extracted = extractSource(response.raw, response.headers['content-type'] ?? '');
        const snapshot = await saveSource({ ...original.source, content: extracted });
        const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
        const old = previous?.payload.snapshot
            ? await readSource(String(previous.payload.snapshot))
            : original;
        return saveSourceCheck({
            ...base,
            sources: [...new Set([id, old.id, snapshot.id])],
            payload: {
                original: id,
                schedule: previous?.payload.schedule,
                scheduleReason: previous?.payload.scheduleReason,
                snapshot:
                    normalized(old.source.content) === normalized(extracted) ? old.id : snapshot.id,
                extractedSnapshot: snapshot.id,
                status:
                    normalized(old.source.content) === normalized(extracted)
                        ? 'unchanged'
                        : 'changed',
                uri: response.url,
                etag: response.headers.etag,
                lastModified: response.headers['last-modified'],
                raw: response.raw.toString('base64'),
                rawHash: createHash('sha256').update(response.raw).digest('hex'),
                contentType: response.headers['content-type'],
                extraction: 'utf8-text-html-json-v1',
                checkedAt: base.at,
            },
        });
    } catch (error) {
        return saveSourceCheck({
            ...base,
            payload: {
                original: id,
                schedule: previous?.payload.schedule,
                scheduleReason: previous?.payload.scheduleReason,
                status: 'blocked',
                reason: String(error),
                snapshot: previous?.payload.snapshot,
                etag: previous?.payload.etag,
                lastModified: previous?.payload.lastModified,
            },
        });
    }
}

export async function refreshDueSource(signal?: AbortSignal) {
    const scan = await scanNeurons();
    const checks = await listArtifacts('source-check');
    const registeredUris = new Set<string>();
    for (const id of new Set(scan.snapshots.flatMap(({ neuron }) => neuron.sources))) {
        const source = await readSource(id).catch(() => null);
        if (source) {
            registeredUris.add(source.source.uri);
        }
    }
    const requests = checks.filter((item) => item.payload.status === 'requested');
    const request = requests.find(
        (item) =>
            !checks.some(
                (check) =>
                    check.at >= item.at &&
                    check.payload.original === item.payload.original &&
                    check.payload.status !== 'requested',
            ),
    );
    if (request) {
        return refreshSource(String(request.payload.original), signal);
    }
    for (const snapshot of scan.snapshots) {
        for (const match of snapshot.neuron.body.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
            const uri = match[0];
            if (registeredUris.has(uri)) {
                continue;
            }
            if (
                !snapshot.neuron.sources.some((id) =>
                    checks.some((item) => item.payload.original === id && item.payload.uri === uri),
                )
            ) {
                const source = await saveSource({
                    title: snapshot.neuron.title,
                    uri,
                    content: `URL recorded in neuron ${snapshot.neuron.id}; source content not yet retrieved.`,
                });
                const prior = checks.filter((item) => item.payload.original === source.id).at(-1);
                if (!prior || Date.now() - Date.parse(prior.at) > 7 * 86400000) {
                    return refreshSource(source.id, signal);
                }
            }
        }
    }
    for (const id of new Set(scan.snapshots.flatMap(({ neuron }) => neuron.sources))) {
        const source = await readSource(id).catch(() => null);
        if (
            !source ||
            (!/^https?:\/\//.test(source.source.uri) && !process.env.NEURON404_SOURCE_ROOTS)
        ) {
            continue;
        }
        const prior = checks.filter((item) => item.payload.original === id).at(-1);
        let interval = 7 * 86400000;
        if (prior?.payload.schedule === 'daily') {
            interval = 86400000;
        } else if (prior?.payload.schedule === 'monthly' && prior.payload.scheduleReason) {
            interval = 30 * 86400000;
        }
        if (!prior || Date.now() - Date.parse(prior.at) >= interval) {
            return refreshSource(id, signal);
        }
    }
    return null;
}
