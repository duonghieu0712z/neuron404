import type { MaintenanceConfig } from './config';
import type { ReviewBundle } from './evaluate';

import { randomUUID } from 'node:crypto';

import { lintNeurons } from '#lib/server/neuron/lint';
import { readRegionOverview } from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';
import { fingerprint } from '#lib/server/neuron/storage';

import { auditInput, bundleRevisions } from './evaluate';
import { neuronScopes, scopeFingerprint } from './neuron-scope';
import { readLatestReport } from './reports';
import { scanNeurons } from './scanner';
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
    neuron?: string;
    requestGeneration?: number;
    scopeSetRevision?: string;
}

export async function snapshots() {
    return (await scanNeurons()).snapshots;
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
    return scopeFingerprint(a) === scopeFingerprint(b);
}

export async function claimWork(config: MaintenanceConfig, mode: MaintenanceMode) {
    return withState(async (state) => {
        const now = Date.now();

        if (now >= state.windowStartedAt + hour) {
            state.windowStartedAt = now;
            state.requests = 0;
        }

        const regions = await readRegions();
        const scan = await scanNeurons();
        const all = scan.snapshots;
        state.scanErrors = scan.errors;
        const lint = await lintNeurons();
        for (const issue of lint) {
            state.scanErrors[issue.fileName] = [state.scanErrors[issue.fileName], issue.message]
                .filter(Boolean)
                .join('; ');
        }

        const valid = new Set(regions.map((region) => `overview:${region.id}`));

        const candidates: Task[] = [];

        if (mode !== 'overview') {
            for (const snapshot of all) {
                const bundles = await neuronScopes(snapshot, all, config);
                const scopeSetRevision = fingerprint(JSON.stringify(bundles.map(scopeFingerprint)));
                for (const bundle of bundles) {
                    const key = `knowledge:${snapshot.neuron.id}:${bundle.scope!.part}`;
                    valid.add(key);
                    const revision = fingerprint(
                        JSON.stringify({
                            scope: scopeFingerprint(bundle),
                            scopeSetRevision,
                            period: Math.floor(now / config.auditIntervalMs),
                            provider: config.provider,
                            model: config.model,
                            promptVersion: 5,
                            requestGeneration: state.reviewRequests[snapshot.neuron.id] ?? 0,
                        }),
                    );
                    if (
                        state.jobs[key]?.fingerprint !== revision &&
                        state.jobs[key]?.status === 'running' &&
                        (state.jobs[key].leaseUntil ?? 0) > now
                    ) {
                        continue;
                    }
                    if (state.jobs[key]?.fingerprint !== revision) {
                        state.jobs[key] = {
                            kind: 'knowledge',
                            neuron: snapshot.neuron.id,
                            dependencies: {
                                ...bundleRevisions(bundle).members,
                                ...bundleRevisions(bundle).context,
                            },
                            part: bundle.scope!.part,
                            region: bundle.region.id,
                            fingerprint: revision,
                            observedAt: now,
                            attempts: 0,
                            nextAttemptAt: 0,
                            status: 'pending',
                        };
                    }
                    const job = state.jobs[key];
                    if (job.status === 'running' && (job.leaseUntil ?? 0) <= now) {
                        job.status = job.attempts >= config.maxAttempts ? 'failed' : 'pending';
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
                    const structural = lint.filter(
                        (issue) =>
                            issue.fileName === `${snapshot.neuron.id}.md` &&
                            issue.kind !== 'invalid-source',
                    );
                    if (structural.length) {
                        job.status = 'blocked';
                        job.error = structural.map((issue) => issue.message).join('; ');
                        continue;
                    }
                    const input = auditInput(bundle);
                    if (Buffer.byteLength(input) > config.maxInputBytes) {
                        job.status = 'blocked';
                        job.error =
                            'A minimum excerpt with metadata exceeds the configured input limit.';
                        continue;
                    }
                    const overview: Task['overview'] = {
                        body: '',
                        revision: null,
                        stale: false,
                        memberRevisions: {},
                        region: bundle.region,
                        updated: null,
                        neurons: [],
                        reviews: [],
                    };
                    candidates.push({
                        key,
                        kind: 'knowledge',
                        neuron: snapshot.neuron.id,
                        region: bundle.region.id,
                        fingerprint: revision,
                        requestGeneration: state.reviewRequests[snapshot.neuron.id] ?? 0,
                        scopeSetRevision,
                        bundle,
                        input,
                        overview,
                        refresh: false,
                        requests: 1,
                    });
                }
            }
        }

        for (const region of regions) {
            const overview = await readRegionOverview(region.id, all);
            const members = all.filter(
                ({ neuron }) => neuron.lifecycle === 'active' && neuron.regions.includes(region.id),
            );

            for (const kind of ['overview'] as const) {
                if (mode !== 'all' && mode !== kind) {
                    continue;
                }

                const key = `${kind}:${region.id}`;
                const refresh = overview.revision === null || overview.stale;

                const bundle = ownBundle(region, members);

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
                        period: undefined,
                        cli: config.cli,
                        provider: config.provider,
                        model: config.model,
                        promptVersion: 4,
                    }),
                );

                if (
                    state.jobs[key]?.fingerprint !== revision &&
                    state.jobs[key]?.status === 'running' &&
                    (state.jobs[key].leaseUntil ?? 0) > now
                ) {
                    continue;
                }
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

                const input = JSON.stringify({
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

        for (const key of Object.keys(state.jobs)) {
            if (
                !valid.has(key) &&
                !(
                    state.jobs[key].status === 'running' && (state.jobs[key].leaseUntil ?? 0) > now
                ) &&
                !key.startsWith('repair:') &&
                !(mode === 'overview' && state.jobs[key].neuron)
            ) {
                delete state.jobs[key];
            }
        }
        if (
            Object.values(state.jobs).some(
                (job) => job.status === 'running' && (job.leaseUntil ?? 0) > now,
            )
        ) {
            return null;
        }
        candidates.sort(
            (a, b) =>
                state.jobs[a.key].observedAt - state.jobs[b.key].observedAt ||
                a.key.localeCompare(b.key),
        );
        const task = candidates.find(
            (candidate) => state.requests + candidate.requests <= config.maxRequestsPerHour,
        );

        if (!task) {
            return null;
        }

        state.dirtyNeurons = [];
        state.lastWork = 'review';
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
