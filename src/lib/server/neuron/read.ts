import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { readRegionReviews } from '#lib/server/maintenance/reports';

import { readRegions } from './regions';
import { CONTENT_DIR, fingerprint, safeId } from './storage';
import { listNeuronFiles, readNeuronSnapshot } from './store';

export async function readNeuronContext(ids: string[]) {
    if (!ids.length || ids.length > 50)
        throw new Error('Read requires between 1 and 50 neuron IDs');
    const snapshots = await Promise.all(
        (await listNeuronFiles()).map((file) => readNeuronSnapshot(file.slice(0, -3))),
    );
    const byId = new Map(snapshots.map((item) => [item.neuron.id, item]));
    const regionIds = [...new Set(ids.flatMap((id) => byId.get(id)?.neuron.regions ?? []))];
    const reviews = (await Promise.all(regionIds.map((id) => readRegionReviews(id, snapshots))))
        .flat()
        .filter((report) => report.kind === 'knowledge');
    return ids.map((id) => {
        const current = byId.get(id);
        if (!current) throw new Error(`Neuron not found: ${id}`);
        const incoming = snapshots.flatMap(({ neuron }) =>
            neuron.synapses
                .filter((edge) => edge.target === id)
                .map((edge) => ({ source: neuron.id, kind: edge.kind, note: edge.note })),
        );
        const relatedIds = new Set([
            ...current.neuron.synapses
                .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                .map((edge) => edge.target),
            ...incoming
                .filter((edge) => ['contradicts', 'questions'].includes(edge.kind))
                .map((edge) => edge.source),
        ]);
        const visited = new Set([id]);
        let replacement = current.neuron.supersededBy;
        while (replacement && !visited.has(replacement)) {
            visited.add(replacement);
            relatedIds.add(replacement);
            replacement = byId.get(replacement)?.neuron.supersededBy;
        }
        const cautions = [...relatedIds]
            .map((target) => byId.get(target))
            .filter((item) => item !== undefined)
            .map(({ neuron, revision }) => ({ neuron, revision }));
        return {
            neuron: current.neuron,
            revision: current.revision,
            incoming,
            cautions,
            reviews: reviews
                .filter(
                    (report) =>
                        report.checks.some((check) => check.subject === id) ||
                        report.findings.some((finding) => finding.neurons.includes(id)),
                )
                .map((report) => ({
                    ...report,
                    checks: report.checks.filter((check) => check.subject === id),
                    findings: report.findings.filter((finding) => finding.neurons.includes(id)),
                })),
        };
    });
}

export async function readNeuronHistory(id: string, revision?: string) {
    const directory = path.join(CONTENT_DIR, 'history', safeId(id));
    if (revision) {
        if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid revision');
        const raw = await readFile(path.join(directory, `${revision}.md`), 'utf8');
        if (fingerprint(raw) !== revision) throw new Error('Revision integrity failure');
        return { id, revision, raw };
    }
    try {
        return {
            id,
            revisions: (await readdir(directory))
                .filter((file) => /^[a-f0-9]{64}\.md$/.test(file))
                .map((file) => file.slice(0, -3)),
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { id, revisions: [] };
        throw error;
    }
}

export async function readCatalog() {
    const [regions, files] = await Promise.all([readRegions(), listNeuronFiles()]);
    const snapshots = await Promise.all(files.map((file) => readNeuronSnapshot(file.slice(0, -3))));
    return {
        neuronCount: snapshots.length,
        regions: regions.map((region) => ({
            ...region,
            count: snapshots.filter(({ neuron }) => neuron.regions.includes(region.id)).length,
        })),
        unfiled: snapshots.filter(({ neuron }) => !neuron.regions.length).length,
    };
}
