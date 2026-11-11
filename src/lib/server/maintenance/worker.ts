import type { MaintenanceConfig } from './config';
import type { ReviewOutput } from '#lib/neuron/review';

import { writeRegionOverviewUnlocked } from '#lib/server/neuron/region-overview';
import { readRegions } from '#lib/server/neuron/regions';

import {
    auditKnowledge,
    buildReviewBundle,
    makeReport,
    validateReviewOutput,
    verifyOverview,
} from './evaluate';
import { generateOverview } from './model';
import { recordMaintenanceEvent, saveReportUnlocked } from './reports';
import { claimWork, ownBundle, sameArtifacts, snapshots, type MaintenanceMode } from './work-queue';
import { hour, withState } from './worker-state';

export type { MaintenanceMode } from './work-queue';

export { readMaintenanceState, retryFailedMaintenance } from './worker-state';

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
    if (!config.provider) {
        return { status: 'disabled' as const };
    }

    signal?.throwIfAborted();
    const task = await claimWork(config, mode);

    if (!task) {
        return { status: 'idle' as const };
    }

    try {
        signal?.throwIfAborted();
        let body: string | undefined;
        let output: ReviewOutput;

        if (task.kind === 'knowledge') {
            output = await models.audit(task.bundle, config, signal);
        } else {
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
            ) {
                return { status: 'discarded' as const, region: task.region };
            }

            const currentRegion = (await readRegions()).find((region) => region.id === task.region);

            if (!currentRegion) {
                throw new Error('Region was removed during review.');
            }

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
            let status: 'reviewed' | 'updated' | 'verified' = 'verified';

            if (task.kind === 'knowledge') {
                status = 'reviewed';
            } else if (task.refresh) {
                status = 'updated';
            }

            return {
                status,
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

            if (!job || job.owner !== task.owner || job.fingerprint !== task.fingerprint) {
                return;
            }

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
