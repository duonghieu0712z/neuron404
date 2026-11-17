import type { ReviewOutput } from '#lib/neuron/review';

import { listArtifacts, saveArtifact } from './artifacts';

export async function applySourcePolicies(policies: ReviewOutput['sourcePolicies']) {
    for (const policy of policies ?? []) {
        const previous = (await listArtifacts('source-check'))
            .filter((item) => item.payload.original === policy.source)
            .at(-1);
        if (previous?.payload.schedule === policy.schedule) {
            continue;
        }
        await saveArtifact({
            version: 1,
            type: 'source-check',
            at: new Date(
                Math.max(Date.now(), previous ? Date.parse(previous.at) + 1 : 0),
            ).toISOString(),
            neurons: {},
            sources: [policy.source],
            regions: [],
            parents: previous ? [previous.id] : [],
            payload: {
                original: policy.source,
                status: 'requested',
                schedule: policy.schedule,
                scheduleReason: policy.reason,
                snapshot: previous?.payload.snapshot,
                etag: previous?.payload.etag,
                lastModified: previous?.payload.lastModified,
                uri: previous?.payload.uri,
            },
        });
    }
}
