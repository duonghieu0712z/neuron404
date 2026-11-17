import { z } from 'zod';

import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { readMaintenanceConfig } from './config';
import { scanNeurons } from './scanner';
import { hour, readMaintenanceState, withState } from './worker-state';

export async function readReviewStatus(id?: string) {
    const config = readMaintenanceConfig();
    const state = await readMaintenanceState();
    const scan = await scanNeurons();
    const now = Date.now();
    const remaining =
        now < state.windowStartedAt + hour
            ? Math.max(0, config.maxRequestsPerHour - state.requests)
            : config.maxRequestsPerHour;
    const jobs = Object.entries(state.jobs)
        .filter(([, job]) => !id || job.neuron === id)
        .map(([key, job]) => ({ key, ...job }));
    const coverage = scan.snapshots
        .filter(({ neuron }) => !id || neuron.id === id)
        .map(({ neuron, revision }) => {
            const own = jobs.filter(
                (job) => job.neuron === neuron.id && !job.key.startsWith('repair:'),
            );
            let status = state.dirtyNeurons.includes(neuron.id) ? 'pending' : 'not-scheduled';
            if (own.length && !state.dirtyNeurons.includes(neuron.id)) {
                status = own.every((job) => job.status === 'succeeded' && job.revision === revision)
                    ? 'completed'
                    : 'pending';
            }
            return {
                neuron: neuron.id,
                revision,
                status,
                parts: own.length,
                completedParts: own.filter(
                    (job) => job.status === 'succeeded' && job.revision === revision,
                ).length,
            };
        });
    return {
        provider: config.provider ?? null,
        enabled: Boolean(config.provider),
        reason: config.provider
            ? null
            : 'No maintenance provider configured; LLM review is inactive.',
        remainingRequests: remaining,
        rateLimited: remaining === 0,
        nextWindowAt: state.windowStartedAt + hour,
        pending: jobs.filter((job) => job.status === 'pending').length,
        jobs,
        coverage,
        scanErrors: scan.errors,
    };
}

export async function requestReview(id: string) {
    await readNeuronSnapshot(id);
    return withState(async (state) => {
        state.reviewRequests[id] = (state.reviewRequests[id] ?? 0) + 1;
        let scheduled = 0;
        for (const job of Object.values(state.jobs)) {
            if (job.neuron === id) {
                job.status = 'pending';
                job.attempts = 0;
                job.nextAttemptAt = 0;
                delete job.owner;
                delete job.leaseUntil;
                delete job.completedAt;
                scheduled++;
            }
        }
        return { neuron: id, status: 'requested', scheduled, execution: 'background' };
    });
}

export const sourceRefreshRequestSchema = z.object({ source: z.string().regex(/^[a-f0-9]{64}$/) });
