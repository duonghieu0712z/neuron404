import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { DATA_DIR } from '#lib/server/data-dir';
import { atomicWrite, withStorageLock } from '#lib/server/neuron/storage';

const jobSchema = z.object({
    kind: z.enum(['overview', 'knowledge']).default('overview'),
    region: z.string().optional(),
    report: z.string().optional(),
    fingerprint: z.string(),
    observedAt: z.number(),
    attempts: z.number(),
    nextAttemptAt: z.number(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'blocked']),
    owner: z.string().optional(),
    leaseUntil: z.number().optional(),
    completedAt: z.number().optional(),
    revision: z.string().optional(),
    error: z.string().optional(),
});

const stateSchema = z.object({
    version: z.literal(1),
    windowStartedAt: z.number(),
    requests: z.number(),
    jobs: z.record(z.string(), jobSchema),
});

type State = z.infer<typeof stateSchema>;

const statePath = path.join(DATA_DIR, 'maintenance', 'state.json');
export const hour = 60 * 60 * 1000;

export async function readMaintenanceState(): Promise<State> {
    try {
        const state = stateSchema.parse(JSON.parse(await readFile(statePath, 'utf8')));
        state.jobs = Object.fromEntries(
            Object.entries(state.jobs).map(([key, job]) => {
                const region = job.region ?? key.replace(/^(overview|knowledge):/, '');
                return [`${job.kind}:${region}`, { ...job, region }];
            }),
        );
        return state;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }

        return { version: 1, windowStartedAt: Date.now(), requests: 0, jobs: {} };
    }
}

export async function withState<T>(action: (state: State) => Promise<T>) {
    return withStorageLock(async () => {
        const state = await readMaintenanceState();
        const before = JSON.stringify(state);
        const result = await action(state);
        const after = JSON.stringify(state);

        if (before !== after) {
            await atomicWrite(statePath, `${after}\n`);
        }

        return result;
    });
}

export async function retryFailedMaintenance() {
    return withState(async (state) => {
        let reset = 0;

        for (const job of Object.values(state.jobs)) {
            if (!['failed', 'blocked'].includes(job.status)) {
                continue;
            }

            job.status = 'pending';
            job.attempts = 0;
            job.nextAttemptAt = 0;
            delete job.error;
            reset++;
        }

        return { reset };
    });
}
