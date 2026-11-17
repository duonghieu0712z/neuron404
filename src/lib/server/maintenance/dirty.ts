import { atomicWrite } from '#lib/server/neuron/storage';

import { readMaintenanceState, statePath } from './worker-state';

export async function markReviewDirtyUnlocked(id: string) {
    const state = await readMaintenanceState();
    const ids = new Set([id]);
    for (const job of Object.values(state.jobs)) {
        if (job.neuron && (job.neuron === id || Object.hasOwn(job.dependencies ?? {}, id))) {
            ids.add(job.neuron);
        }
    }
    state.dirtyNeurons = [...new Set([...state.dirtyNeurons, ...ids])];
    await atomicWrite(statePath, JSON.stringify(state));
}
