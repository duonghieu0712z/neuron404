import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { fingerprint } from '#lib/server/neuron/storage';

import { listArtifacts, saveArtifact } from './artifacts';
import { saveNeuronReport } from './neuron-reports';
import { reportSchema } from './report-schema';
import { directory, readDecisions } from './report-storage';

export async function importLegacyReviews() {
    let names: string[];
    try {
        names = await readdir(path.join(directory, 'reports'), { recursive: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return;
    }
    const known = new Set((await listArtifacts('report')).map((item) => item.payload.id));
    const decisions = await readDecisions();
    for (const name of names.filter((name) => /[a-f0-9]{64}\.json$/.test(name)).sort()) {
        const report = reportSchema.parse(
            JSON.parse(await readFile(path.join(directory, 'reports', name), 'utf8')),
        );
        const { id, ...content } = report;
        if (fingerprint(JSON.stringify(content)) !== id) {
            throw new Error('Legacy report integrity failure.');
        }
        if (known.has(id)) {
            continue;
        }
        // Preserve the original report hash; no rewriting or schema conversion of old bytes.
        await saveNeuronReport(content);
        for (const finding of report.findings) {
            const dispute = fingerprint(
                JSON.stringify({
                    kind: finding.kind,
                    neurons: [...finding.neurons].sort(),
                    claims: finding.evidence
                        .filter((item) => item.kind === 'neuron')
                        .map((item) => [item.id, item.quote.trim().replace(/\s+/g, ' ')])
                        .sort(),
                }),
            );
            const event = (await listArtifacts('dispute')).find(
                (item) => item.payload.dispute === dispute,
            );
            const decision = decisions[finding.id];
            if (!decision || !event) {
                continue;
            }
            await saveArtifact({
                version: 1,
                type: 'dispute',
                at: decision.at,
                neurons: event.neurons,
                sources: event.sources,
                regions: event.regions,
                parents: [event.id],
                payload: {
                    dispute,
                    action: decision.status,
                    note: decision.note,
                    author: 'legacy-decision',
                    evidence: finding.evidence,
                    report: decision.report,
                    finding: finding.id,
                },
            });
        }
    }
}
