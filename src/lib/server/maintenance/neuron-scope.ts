import type { MaintenanceConfig } from './config';
import type { ReviewBundle, Snapshot } from './review-bundle';

import { readRegions } from '#lib/server/neuron/regions';
import { readSource } from '#lib/server/neuron/sources';
import { fingerprint } from '#lib/server/neuron/storage';

import { listArtifacts, sourceCheckHeads } from './artifacts';
import { evidencePassages } from './passages';
import { buildReviewBundle } from './review-bundle';
import { referenceInput } from './review-input';

export async function neuronScopes(snapshot: Snapshot, all: Snapshot[], config: MaintenanceConfig) {
    const region = (await readRegions()).find((region) =>
        snapshot.neuron.regions.includes(region.id),
    ) ?? { id: 'unfiled', title: 'Unfiled knowledge', description: '' };
    const full = await buildReviewBundle(region, all, [snapshot.neuron.id], false);
    const checks = await listArtifacts('source-check');
    for (const check of sourceCheckHeads(checks).filter((check) => check.payload.snapshot)) {
        if (
            full.sources.some((source) => source.id === check.payload.original) ||
            Object.hasOwn(check.neurons, snapshot.neuron.id)
        ) {
            const source = await readSource(String(check.payload.snapshot)).catch(() => null);
            if (source && !full.sources.some((item) => item.id === source.id)) {
                full.sources.push(source);
            }
        }
    }
    full.previousReport = null;
    full.changed = [snapshot.neuron.id];

    const selected = new Set(full.context.map(({ neuron }) => neuron.id));
    // Rotate a stable catalog page even when lexical overlap is absent.
    const catalog = all
        .filter(({ neuron }) => neuron.id !== snapshot.neuron.id)
        .sort((a, b) => a.neuron.id.localeCompare(b.neuron.id));
    const pages = Math.max(1, Math.ceil(catalog.length / 8));
    const page = Math.floor(Date.now() / config.auditIntervalMs) % pages;
    const discovery = catalog.slice(page * 8, (page + 1) * 8);
    full.context.push(...discovery.filter(({ neuron }) => !selected.has(neuron.id)));
    for (const { neuron } of discovery) {
        for (const id of neuron.sources) {
            if (
                full.sources.some((source) => source.id === id) ||
                full.unavailableSources.includes(id)
            ) {
                continue;
            }
            try {
                full.sources.push(await readSource(id));
            } catch {
                full.unavailableSources.push(id);
            }
        }
    }
    const selection = Object.fromEntries(
        full.context.map(({ neuron }) => [
            neuron.id,
            selected.has(neuron.id)
                ? 'Direct relation, shared source or content/cue overlap'
                : `Rotating catalog page ${page + 1}/${pages}`,
        ]),
    );

    const pieces: {
        kind: 'source' | 'context';
        id: string;
        text: string;
        start: number;
        end: number;
    }[] = [];
    function split(kind: 'source' | 'context', id: string, body: string) {
        let offset = 0;
        for (const text of evidencePassages(body)) {
            const start = body.indexOf(text, offset);
            pieces.push({ kind, id, text, start, end: start + text.length });
            offset = start + text.length;
        }
    }
    for (const item of full.sources) {
        split('source', item.id, item.source.content);
    }
    for (const item of full.context) {
        split('context', item.neuron.id, item.neuron.body);
    }
    const memberParts: string[] = [];
    for (const passage of evidencePassages(snapshot.neuron.body)) {
        const last = memberParts.length - 1;
        if (
            last >= 0 &&
            Buffer.byteLength(memberParts[last] + passage) < config.maxInputBytes / 4
        ) {
            memberParts[last] += passage;
        } else {
            memberParts.push(passage);
        }
    }
    const bundles: ReviewBundle[] = [];
    const contexts = new Map(full.context.map((item) => [item.neuron.id, item]));
    const sources = new Map(full.sources.map((item) => [item.id, item]));

    for (const memberBody of memberParts) {
        const base: ReviewBundle = {
            ...full,
            members: [{ ...snapshot, neuron: { ...snapshot.neuron, body: memberBody } }],
            context: [],
            sources: [],
            selection,
            catalog: discovery.map(({ neuron, revision }) => ({
                id: neuron.id,
                revision,
                title: neuron.title,
                cues: neuron.retrievalCues,
            })),
            scope: { neuron: snapshot.neuron.id, part: 0, total: 1, description: '' },
        };
        let current = structuredClone(base);
        let ranges: typeof pieces = [];
        const describe = (items: typeof pieces) => {
            const start = snapshot.neuron.body.indexOf(memberBody);
            return JSON.stringify({
                member: { start, end: start + memberBody.length, revision: snapshot.revision },
                evidence: items.map(({ kind, id, start, end }) => ({ kind, id, start, end })),
                catalogPage: page + 1,
                catalogPages: pages,
                limitation:
                    'Only the listed exact excerpts were examined. Cross-excerpt claims may remain unverifiable; this is not an exhaustive all-pairs or real-world truth assessment.',
            });
        };
        const finish = () => {
            current.scope!.description = describe(ranges);
            bundles.push(current);
            current = structuredClone(base);
            ranges = [];
        };
        for (const piece of pieces) {
            const candidate = structuredClone(current);
            if (piece.kind === 'source') {
                const item = candidate.sources.find((item) => item.id === piece.id);
                if (item) {
                    const start = ranges.find(
                        (range) => range.kind === 'source' && range.id === piece.id,
                    )!.start;
                    item.source.content = sources
                        .get(piece.id)!
                        .source.content.slice(start, piece.end);
                } else {
                    candidate.sources.push({
                        ...sources.get(piece.id)!,
                        source: { ...sources.get(piece.id)!.source, content: piece.text },
                    });
                }
            } else {
                const item = candidate.context.find((item) => item.neuron.id === piece.id);
                if (item) {
                    const start = ranges.find(
                        (range) => range.kind === 'context' && range.id === piece.id,
                    )!.start;
                    item.neuron.body = contexts.get(piece.id)!.neuron.body.slice(start, piece.end);
                } else {
                    candidate.context.push({
                        ...contexts.get(piece.id)!,
                        neuron: { ...contexts.get(piece.id)!.neuron, body: piece.text },
                    });
                }
            }
            candidate.scope!.description = describe([...ranges, piece]);
            if (Buffer.byteLength(referenceInput(candidate).input) + 256 > config.maxInputBytes) {
                if (ranges.length) {
                    finish();
                }
                if (piece.kind === 'source') {
                    current.sources.push({
                        ...sources.get(piece.id)!,
                        source: { ...sources.get(piece.id)!.source, content: piece.text },
                    });
                } else {
                    current.context.push({
                        ...contexts.get(piece.id)!,
                        neuron: { ...contexts.get(piece.id)!.neuron, body: piece.text },
                    });
                }
            } else {
                current = candidate;
            }
            ranges.push(piece);
        }
        finish();
    }
    for (const [part, bundle] of bundles.entries()) {
        bundle.scope!.part = part;
        bundle.scope!.total = bundles.length;
        // Prior findings are preserved in dispute records, not repeated in every model packet.
        bundle.previousReport = null;
    }
    return bundles;
}

export function scopeFingerprint(bundle: ReviewBundle) {
    return fingerprint(
        JSON.stringify({
            region: bundle.region,
            members: bundle.members.map(({ revision }) => revision),
            context: bundle.context.map(({ neuron, revision }) => [neuron.id, revision]),
            sources: bundle.sources.map(({ id, source }) => [id, fingerprint(source.content)]),
            unavailable: bundle.unavailableSources,
            scope: bundle.scope,
            catalog: bundle.catalog,
        }),
    );
}
