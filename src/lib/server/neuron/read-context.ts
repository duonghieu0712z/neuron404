import { eq } from 'drizzle-orm';

import { synapses } from '#lib/server/db/schema';
import { readRegionReviews } from '#lib/server/maintenance/reports';

import { readIndexedNeuron, withIndexedStore } from './indexed-store';
import { readPartialReferences } from './partial-references';
import { readNeuronSnapshot } from './store';

export async function readNeuronContext(ids: string[]) {
    if (!ids.length || ids.length > 50) {
        throw new Error('Read requires between 1 and 50 neuron IDs');
    }

    return withIndexedStore(async (db) => {
        const partial = await readPartialReferences();

        const unavailable = new Set(
            Object.values(partial).flatMap((references) => references.neurons),
        );

        const cache = new Map<string, Awaited<ReturnType<typeof readNeuronSnapshot>>>();

        const read = async (id: string) => {
            const cached = cache.get(id);

            if (cached) {
                return cached;
            }

            const snapshot = await readIndexedNeuron(db, id);
            cache.set(id, snapshot);
            return snapshot;
        };

        const selected = [];

        for (const id of ids) {
            selected.push(await read(id));
        }

        const regionIds = [...new Set(selected.flatMap(({ neuron }) => neuron.regions))];

        const reviews = (
            await Promise.all(regionIds.map((id) => readRegionReviews(id, undefined, db)))
        )
            .flat()
            .filter((report) => report.kind === 'knowledge');

        const result = [];

        for (const current of selected) {
            const id = current.neuron.id;

            const edges = await db
                .select({
                    source: synapses.sourceNeuronId,
                    kind: synapses.kind,
                    note: synapses.note,
                })
                .from(synapses)
                .where(eq(synapses.targetNeuronId, id))
                .orderBy(synapses.sourceNeuronId)
                .limit(201);

            const incoming = edges.slice(0, 200);
            const relatedIds = new Set<string>();
            const missingContext = new Set<string>();
            let truncated = edges.length > incoming.length;
            const visited = new Set([id]);
            let replacement = current.neuron.supersededBy;

            while (replacement && !visited.has(replacement)) {
                if (relatedIds.size >= 50) {
                    truncated = true;
                    break;
                }

                visited.add(replacement);

                if (unavailable.has(replacement)) {
                    missingContext.add(replacement);
                    truncated = true;
                    break;
                }

                relatedIds.add(replacement);
                replacement = (await read(replacement)).neuron.supersededBy;
            }

            const cautions = [
                ...current.neuron.synapses
                    .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                    .map((edge) => edge.target),
                ...incoming
                    .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                    .map((edge) => edge.source),
            ];

            for (const target of cautions) {
                if (unavailable.has(target)) {
                    missingContext.add(target);
                    truncated = true;
                    continue;
                }

                if (relatedIds.has(target)) {
                    continue;
                }

                if (relatedIds.size >= 50) {
                    truncated = true;
                    break;
                }

                relatedIds.add(target);
            }

            const related = [];

            for (const target of relatedIds) {
                const { neuron, revision } = await read(target);
                related.push({ neuron, revision });
            }

            result.push({
                neuron: current.neuron,
                revision: current.revision,
                incoming,
                cautions: related,
                contextTruncated: truncated,
                unavailableReferences: {
                    neurons: [...new Set([...(partial[id]?.neurons ?? []), ...missingContext])],
                    regions: partial[id]?.regions ?? [],
                },
                reviews: reviews
                    .filter(
                        (report) =>
                            report.checks.some((check) => check.subject === id) ||
                            report.findings.some((finding) => finding.neurons.includes(id)),
                    )
                    .map((report) => ({
                        id: report.id,
                        kind: report.kind,
                        region: report.region,
                        createdAt: report.createdAt,
                        stale: report.stale,
                        summary: report.summary,
                        verdict: report.verdict,
                        coverage: report.coverage,
                        checks: report.checks.filter((check) => check.subject === id),
                        findings: report.findings.filter((finding) => finding.neurons.includes(id)),
                    })),
            });
        }

        return result;
    });
}
