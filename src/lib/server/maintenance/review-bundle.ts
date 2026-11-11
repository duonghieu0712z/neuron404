import type { ReviewReport } from '#lib/neuron/review';
import type { Region } from '#lib/neuron/schema';

import { readSource } from '#lib/server/neuron/sources';
import { fingerprint } from '#lib/server/neuron/storage';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { openReviewFindings, readLatestReport } from './reports';

export type Snapshot = Awaited<ReturnType<typeof readNeuronSnapshot>>;

export interface ReviewBundle {
    region: Region;
    members: Snapshot[];
    context: Snapshot[];
    sources: Awaited<ReturnType<typeof readSource>>[];
    unavailableSources: string[];
    changed: string[];
    previousReport: ReviewReport | null;
}

function tokens(snapshot: Snapshot) {
    return new Set(
        `${snapshot.neuron.title} ${snapshot.neuron.aliases.join(' ')}`
            .toLowerCase()
            .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
    );
}

export async function buildReviewBundle(
    region: Region,
    snapshots: Snapshot[],
): Promise<ReviewBundle> {
    const members = snapshots.filter(({ neuron }) => neuron.regions.includes(region.id));
    const memberIds = new Set(members.map(({ neuron }) => neuron.id));

    const directIds = new Set(
        members.flatMap(({ neuron }) => [
            ...neuron.synapses.map((edge) => edge.target),
            ...(neuron.supersededBy ? [neuron.supersededBy] : []),
        ]),
    );

    for (const { neuron } of snapshots) {
        if (
            neuron.synapses.some((edge) => memberIds.has(edge.target)) ||
            (neuron.supersededBy && memberIds.has(neuron.supersededBy))
        ) {
            directIds.add(neuron.id);
        }
    }

    const vocabulary = new Set(members.flatMap((snapshot) => [...tokens(snapshot)]));

    const candidates = snapshots
        .filter(({ neuron }) => !memberIds.has(neuron.id) && !directIds.has(neuron.id))
        .map((snapshot) => ({
            snapshot,
            score: [...tokens(snapshot)].filter((token) => vocabulary.has(token)).length,
        }))
        .filter(({ score }) => score >= 2)
        .sort(
            (a, b) => b.score - a.score || a.snapshot.neuron.id.localeCompare(b.snapshot.neuron.id),
        )
        .slice(0, 3);

    const contextIds = new Set([
        ...directIds,
        ...candidates.map(({ snapshot }) => snapshot.neuron.id),
    ]);

    const context = snapshots.filter(
        ({ neuron }) => !memberIds.has(neuron.id) && contextIds.has(neuron.id),
    );

    const sourceIds = [
        ...new Set([...members, ...context].flatMap(({ neuron }) => neuron.sources)),
    ].sort();

    const sources: ReviewBundle['sources'] = [];
    const unavailableSources: string[] = [];

    for (const id of sourceIds) {
        try {
            sources.push(await readSource(id));
        } catch {
            unavailableSources.push(id);
        }
    }

    const storedReport = await readLatestReport(region.id, 'knowledge');

    const previousReport =
        storedReport === null
            ? null
            : { ...storedReport, findings: await openReviewFindings(storedReport) };

    const changed = members
        .filter(({ neuron, revision }) => previousReport?.members[neuron.id] !== revision)
        .map(({ neuron }) => neuron.id);
    return { region, members, context, sources, unavailableSources, changed, previousReport };
}

export function bundleRevisions(bundle: ReviewBundle) {
    return {
        regionRevision: fingerprint(JSON.stringify(bundle.region)),
        members: Object.fromEntries(
            bundle.members.map(({ neuron, revision }) => [neuron.id, revision]),
        ),
        context: Object.fromEntries(
            bundle.context.map(({ neuron, revision }) => [neuron.id, revision]),
        ),
        sources: [...bundle.sources.map(({ id }) => id), ...bundle.unavailableSources].sort(),
    };
}
