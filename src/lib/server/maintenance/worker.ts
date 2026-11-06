import type { MaintenanceConfig } from './config';
import type { ReviewBundle } from './evaluate';
import type { ReviewOutput } from '#lib/neuron/review';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { DATA_DIR } from '#lib/server/data-dir';
import {
    readRegionOverview,
    writeRegionOverviewUnlocked,
} from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';
import { atomicWrite, fingerprint, withStorageLock } from '#lib/server/neuron/storage';
import { listNeuronFiles, readNeuronSnapshot } from '#lib/server/neuron/store';

import {
    auditInput,
    auditKnowledge,
    buildReviewBundle,
    bundleRevisions,
    makeReport,
    verifyOverview,
    validateReviewOutput,
} from './evaluate';
import { generateOverview } from './model';
import { readLatestReport, recordMaintenanceEvent, saveReportUnlocked } from './reports';

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
const hour = 60 * 60 * 1000;

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
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return { version: 1, windowStartedAt: Date.now(), requests: 0, jobs: {} };
    }
}

async function withState<T>(action: (state: State) => Promise<T>) {
    return withStorageLock(async () => {
        const state = await readMaintenanceState();
        const before = JSON.stringify(state);
        const result = await action(state);
        const after = JSON.stringify(state);
        if (before !== after) await atomicWrite(statePath, `${after}\n`);
        return result;
    });
}

export async function retryFailedMaintenance() {
    return withState(async (state) => {
        let reset = 0;
        for (const job of Object.values(state.jobs)) {
            if (!['failed', 'blocked'].includes(job.status)) continue;
            job.status = 'pending';
            job.attempts = 0;
            job.nextAttemptAt = 0;
            delete job.error;
            reset++;
        }
        return { reset };
    });
}

export type MaintenanceMode = 'all' | 'overview' | 'knowledge';
interface Task {
    key: string;
    kind: 'overview' | 'knowledge';
    region: string;
    fingerprint: string;
    bundle: ReviewBundle;
    input: string;
    overview: Awaited<ReturnType<typeof readRegionOverview>>;
    refresh: boolean;
    requests: number;
}

async function snapshots() {
    return Promise.all(
        (await listNeuronFiles()).map((name) => readNeuronSnapshot(name.slice(0, -3))),
    );
}

function ownBundle(region: ReviewBundle['region'], members: ReviewBundle['members']): ReviewBundle {
    return {
        region,
        members,
        context: [],
        sources: [],
        unavailableSources: [],
        changed: [],
        previousReport: null,
    };
}

function sameArtifacts(a: ReviewBundle, b: ReviewBundle) {
    return (
        JSON.stringify({ ...bundleRevisions(a), unavailable: a.unavailableSources }) ===
        JSON.stringify({ ...bundleRevisions(b), unavailable: b.unavailableSources })
    );
}

async function claimWork(config: MaintenanceConfig, mode: MaintenanceMode) {
    return withState(async (state) => {
        const now = Date.now();
        if (now >= state.windowStartedAt + hour) {
            state.windowStartedAt = now;
            state.requests = 0;
        }
        const regions = await readRegions();
        const all = await snapshots();
        const valid = new Set(
            regions.flatMap((region) => [`overview:${region.id}`, `knowledge:${region.id}`]),
        );
        for (const key of Object.keys(state.jobs)) if (!valid.has(key)) delete state.jobs[key];
        const candidates: Task[] = [];
        for (const region of regions) {
            const overview = await readRegionOverview(region.id, all);
            const members = all.filter(({ neuron }) => neuron.regions.includes(region.id));
            for (const kind of ['overview', 'knowledge'] as const) {
                if (mode !== 'all' && mode !== kind) continue;
                const key = `${kind}:${region.id}`;
                const refresh = overview.revision === null || overview.stale;
                const bundle =
                    kind === 'knowledge'
                        ? await buildReviewBundle(region, all)
                        : ownBundle(region, members);
                const latest = await readLatestReport(region.id, kind);
                const revisions = bundleRevisions(bundle);
                if (
                    kind === 'overview' &&
                    !refresh &&
                    latest?.candidateHash === fingerprint(overview.body) &&
                    latest.regionRevision === revisions.regionRevision &&
                    JSON.stringify(latest.members) === JSON.stringify(revisions.members)
                )
                    continue;
                const revision = fingerprint(
                    JSON.stringify({
                        kind,
                        ...revisions,
                        unavailable: bundle.unavailableSources,
                        overview: kind === 'overview' ? overview.revision : undefined,
                        period:
                            kind === 'knowledge'
                                ? Math.floor(now / config.auditIntervalMs)
                                : undefined,
                        cli: config.cli,
                        provider: config.provider,
                        model: config.model,
                        promptVersion: kind === 'overview' ? 4 : 3,
                    }),
                );
                if (state.jobs[key]?.fingerprint !== revision)
                    state.jobs[key] = {
                        kind,
                        region: region.id,
                        fingerprint: revision,
                        observedAt: now,
                        attempts: 0,
                        nextAttemptAt: 0,
                        status: latest?.inputRevision === revision ? 'succeeded' : 'pending',
                        report: latest?.inputRevision === revision ? latest.id : undefined,
                    };
                const job = state.jobs[key];
                if (job.status === 'running' && (job.leaseUntil ?? 0) <= now) {
                    job.status = job.attempts >= config.maxAttempts ? 'failed' : 'pending';
                    job.error = 'Previous worker lease expired.';
                    delete job.owner;
                    delete job.leaseUntil;
                }
                if (
                    job.status !== 'pending' ||
                    job.nextAttemptAt > now ||
                    now < job.observedAt + config.settleMs
                )
                    continue;
                if (job.attempts >= config.maxAttempts) {
                    job.status = 'failed';
                    continue;
                }
                if (!members.length) {
                    job.status = 'blocked';
                    job.error = 'Region has no members. Review it manually.';
                    continue;
                }
                const input =
                    kind === 'knowledge'
                        ? auditInput(bundle)
                        : JSON.stringify({
                              region,
                              previousOverview: overview.body,
                              members: members.map(({ neuron, revision }) => ({
                                  ...neuron,
                                  revision,
                              })),
                              reviewFeedback: latest?.findings ?? [],
                          });
                const reserve = kind === 'overview' ? 20_000 : 0;
                if (Buffer.byteLength(input) + reserve > config.maxInputBytes) {
                    job.status = 'blocked';
                    job.error =
                        'Review scope exceeds the size limit; evidence was not truncated or sent.';
                    continue;
                }
                candidates.push({
                    key,
                    kind,
                    region: region.id,
                    fingerprint: revision,
                    bundle,
                    input,
                    overview,
                    refresh,
                    requests: kind === 'overview' && refresh ? 2 : 1,
                });
            }
        }
        candidates.sort(
            (a, b) =>
                Number(!(a.kind === 'overview' && a.refresh)) -
                    Number(!(b.kind === 'overview' && b.refresh)) ||
                state.jobs[a.key].observedAt - state.jobs[b.key].observedAt,
        );
        const task = candidates.find(
            (candidate) => state.requests + candidate.requests <= config.maxRequestsPerHour,
        );
        if (!task) return null;
        const job = state.jobs[task.key];
        job.status = 'running';
        job.attempts++;
        job.owner = randomUUID();
        job.leaseUntil = now + config.timeoutMs * task.requests + 30_000;
        delete job.error;
        state.requests += task.requests;
        return { ...task, owner: job.owner, attempt: job.attempts };
    });
}

export const maintenanceModels = {
    generate: generateOverview,
    verify: verifyOverview,
    audit: auditKnowledge,
};

export async function runMaintenancePass(
    config: MaintenanceConfig,
    signal?: AbortSignal,
    models = maintenanceModels,
    mode: MaintenanceMode = 'all',
) {
    if (!config.provider) return { status: 'disabled' as const };
    signal?.throwIfAborted();
    const task = await claimWork(config, mode);
    if (!task) return { status: 'idle' as const };
    try {
        signal?.throwIfAborted();
        let body: string | undefined;
        let output: ReviewOutput;
        if (task.kind === 'knowledge') output = await models.audit(task.bundle, config, signal);
        else {
            body = task.refresh
                ? await models.generate(task.input, config, signal)
                : task.overview.body;
            signal?.throwIfAborted();
            output = await models.verify(task.bundle, body, config, signal);
        }
        signal?.throwIfAborted();
        output = validateReviewOutput(output, task.bundle, body);
        return await withState(async (state) => {
            const job = state.jobs[task.key];
            if (
                !job ||
                job.owner !== task.owner ||
                job.fingerprint !== task.fingerprint ||
                (job.leaseUntil ?? 0) <= Date.now()
            )
                return { status: 'discarded' as const, region: task.region };
            const currentRegion = (await readRegions()).find((region) => region.id === task.region);
            if (!currentRegion) throw new Error('Region was removed during review.');
            const all = await snapshots();
            const current =
                task.kind === 'knowledge'
                    ? await buildReviewBundle(currentRegion, all)
                    : ownBundle(
                          currentRegion,
                          all.filter(({ neuron }) => neuron.regions.includes(task.region)),
                      );
            const report = await saveReportUnlocked(
                makeReport(task.kind, task.bundle, task.fingerprint, output, body),
            );
            job.report = report.id;
            if (!sameArtifacts(task.bundle, current)) {
                job.status = 'pending';
                job.nextAttemptAt = Date.now() + config.settleMs;
                delete job.owner;
                delete job.leaseUntil;
                await recordMaintenanceEvent({
                    operation: 'discarded',
                    region: task.region,
                    report: report.id,
                    reason: 'Input revisions changed during review.',
                });
                return { status: 'discarded' as const, region: task.region, report: report.id };
            }
            if (task.kind === 'overview' && report.verdict !== 'pass') {
                job.status = 'blocked';
                job.error =
                    'Overview did not pass evidence review. Inspect the report before retrying.';
                delete job.owner;
                delete job.leaseUntil;
                return { status: 'needs-review' as const, region: task.region, report: report.id };
            }
            if (task.kind === 'overview' && task.refresh) {
                const saved = await writeRegionOverviewUnlocked(task.region, {
                    body,
                    expectedRevision: task.overview.revision,
                    memberRevisions: task.overview.memberRevisions,
                });
                job.revision = saved.revision ?? undefined;
                await recordMaintenanceEvent({
                    operation: 'overview-published',
                    region: task.region,
                    report: report.id,
                    revision: saved.revision,
                    previousRevision: task.overview.revision,
                });
            }
            job.status = 'succeeded';
            job.completedAt = Date.now();
            delete job.owner;
            delete job.leaseUntil;
            delete job.error;
            return {
                status:
                    task.kind === 'knowledge'
                        ? ('reviewed' as const)
                        : task.refresh
                          ? ('updated' as const)
                          : ('verified' as const),
                region: task.region,
                report: report.id,
                verdict: report.verdict,
                findings: report.findings.length,
                revision: job.revision,
            };
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Maintenance failed.';
        await withState(async (state) => {
            const job = state.jobs[task.key];
            if (!job || job.owner !== task.owner || job.fingerprint !== task.fingerprint) return;
            job.status = job.attempts >= config.maxAttempts ? 'failed' : 'pending';
            job.nextAttemptAt = Date.now() + Math.min(hour, config.pollMs * 2 ** job.attempts);
            job.error = message.slice(0, 500);
            delete job.owner;
            delete job.leaseUntil;
            await recordMaintenanceEvent({
                operation: 'failed',
                region: task.region,
                kind: task.kind,
                inputRevision: task.fingerprint,
                error: job.error,
            });
        });
        return {
            status: 'failed' as const,
            region: task.region,
            attempt: task.attempt,
            error: message,
        };
    }
}
