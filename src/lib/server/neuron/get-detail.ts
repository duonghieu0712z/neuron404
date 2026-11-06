import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { db } from '#lib/server/db';
import { neurons, synapses } from '#lib/server/db/schema';
import { readRegionReviews } from '#lib/server/maintenance/reports';

import { readIndexedNeuron } from './indexed-store';
import { INDEX_RECHECK_MS, synchronizeIndexUnlocked } from './indexer';
import { readRegions } from './regions';
import { readSource } from './sources';
import { withStorageLock } from './storage';

export type NeuronDetail = Awaited<ReturnType<typeof getNeuronDetail>>;

export async function getNeuronDetail(id: string) {
    return withStorageLock(async () => {
        await synchronizeIndexUnlocked(db, false, INDEX_RECHECK_MS);
        let neuron = await db.query.neurons.findFirst({ where: eq(neurons.id, id) });
        if (!neuron) {
            throw error(404, 'Neuron not found');
        }
        const snapshot = await readIndexedNeuron(db, id);
        if (snapshot.revision !== neuron.revision) {
            neuron = await db.query.neurons.findFirst({ where: eq(neurons.id, id) });
            if (!neuron) {
                throw error(404, 'Neuron not found');
            }
        }
        const source = snapshot.neuron;

        const outgoing = await db
            .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, target: neurons })
            .from(synapses)
            .innerJoin(neurons, eq(neurons.id, synapses.targetNeuronId))
            .where(eq(synapses.sourceNeuronId, id));

        const incoming = await db
            .select({ id: synapses.id, kind: synapses.kind, note: synapses.note, source: neurons })
            .from(synapses)
            .innerJoin(neurons, eq(neurons.id, synapses.sourceNeuronId))
            .where(eq(synapses.targetNeuronId, id));

        const catalog = await readRegions();
        const regions = catalog.filter((region) => source.regions.includes(region.id));
        const sources = (await Promise.all(source.sources.map(readSource))).map(
            ({ id, capturedAt, source: { title, uri, locator } }) => ({
                id,
                capturedAt,
                source: { title, uri, locator },
            }),
        );
        const reviews = (
            await Promise.all(regions.map((region) => readRegionReviews(region.id, undefined, db)))
        )
            .flat()
            .filter((report) => report.kind === 'knowledge')
            .map((report) => ({
                ...report,
                checks: report.checks.filter((check) => check.subject === id),
                findings: report.findings.filter((finding) => finding.neurons.includes(id)),
            }))
            .filter((report) => report.checks.length || report.findings.length);
        return { neuron, outgoing, incoming, regions, sources, reviews };
    });
}
