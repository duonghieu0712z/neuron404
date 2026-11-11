import type { MaintenanceConfig } from './config';
import type { ReviewBundle } from './evaluate';

import { randomUUID } from 'node:crypto';

import { readRegionOverview } from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';
import { fingerprint } from '#lib/server/neuron/storage';
import { listNeuronFiles, readNeuronSnapshot } from '#lib/server/neuron/store';

import { auditInput, buildReviewBundle, bundleRevisions } from './evaluate';
import { readLatestReport } from './reports';
import { hour, withState } from './worker-state';

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

export async function snapshots() {
    return Promise.all(
        (await listNeuronFiles()).map((name) => readNeuronSnapshot(name.slice(0, -3))),
    );
}

export function ownBundle(
    region: ReviewBundle['region'],
    members: ReviewBundle['members'],
): ReviewBundle {
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

export function sameArtifacts(a: ReviewBundle, b: ReviewBundle) {
    return (
        JSON.stringify({ ...bundleRevisions(a), unavailable: a.unavailableSources }) ===
        JSON.stringify({ ...bundleRevisions(b), unavailable: b.unavailableSources })
    );
}

export async function claimWork(config: MaintenanceConfig, mode: MaintenanceMode) {
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

        for (const key of Object.keys(state.jobs)) {
            if (!valid.has(key)) {
                delete state.jobs[key];
            }
        }

        const candidates: Task[] = [];

        for (const region of regions) {
            const overview = await readRegionOverview(region.id, all);
            const members = all.filter(({ neuron }) => neuron.regions.includes(region.id));

            for (const kind of ['overview', 'knowledge'] as const) {
                if (mode !== 'all' && mode !== kind) {
                    continue;
                }

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
                ) {
                    continue;
                }

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

                if (state.jobs[key]?.fingerprint !== revision) {
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
                }

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
                ) {
                    continue;
                }

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

        if (!task) {
            return null;
        }

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
