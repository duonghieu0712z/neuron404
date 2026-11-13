import './env';

import process from 'node:process';

import { readMaintenanceConfig } from '#lib/server/maintenance/config';
import { decideFinding, listReviewReports, readReport } from '#lib/server/maintenance/reports';
import { readMaintenanceState } from '#lib/server/maintenance/worker';

import { runWorker } from './maintenance/run-worker';

const args = process.argv.slice(2);

function option(name: string) {
    const index = args.indexOf(name);

    if (index < 0) {
        return undefined;
    }

    if (!args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(`Missing value for ${name}`);
    }

    return args[index + 1];
}

const controller = new AbortController();

const stop = () => controller.abort();

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

function log(value: object) {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
}

try {
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];

        if (['--report', '--resolve', '--dismiss', '--note'].includes(argument)) {
            option(argument);
            index++;
            continue;
        }

        if (
            ![
                '--once',
                '--status',
                '--retry-failed',
                '--reports',
                '--audit',
                '--overview',
            ].includes(argument)
        ) {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if (args.includes('--resolve') || args.includes('--dismiss')) {
        if (args.includes('--resolve') && args.includes('--dismiss')) {
            throw new Error('Choose resolve or dismiss, not both.');
        }

        const report = option('--report');
        const note = option('--note');

        if (!report || !note) {
            throw new Error('Finding decisions require --report ID and --note TEXT.');
        }

        console.log(
            JSON.stringify(
                await decideFinding(
                    report,
                    (option('--resolve') ?? option('--dismiss'))!,
                    args.includes('--resolve') ? 'resolved' : 'dismissed',
                    note,
                ),
                null,
                2,
            ),
        );
    } else if (args.includes('--report')) {
        const report = await readReport(option('--report')!);

        if (!report) {
            throw new Error('Review report not found.');
        }

        console.log(JSON.stringify(report, null, 2));
    } else if (args.includes('--reports')) {
        console.log(
            JSON.stringify(
                (await listReviewReports()).map((report) => ({
                    id: report.id,
                    region: report.region,
                    kind: report.kind,
                    createdAt: report.createdAt,
                    verdict: report.verdict,
                    stale: report.stale,
                    appliesToCurrentOverview: report.appliesToCurrentOverview,
                    openFindings: report.findings.filter((finding) => finding.status === 'open')
                        .length,
                    summary: report.summary,
                })),
                null,
                2,
            ),
        );
    } else if (args.includes('--status')) {
        const config = readMaintenanceConfig();
        console.log(
            JSON.stringify(
                {
                    ...(await readMaintenanceState()),
                    enabled: !!config.provider,
                    provider: config.provider ?? null,
                    model: config.model ?? null,
                },
                null,
                2,
            ),
        );
    } else {
        await runWorker(args, controller.signal, log);
    }
} catch (error) {
    if (!controller.signal.aborted) {
        log({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        process.exitCode = 1;
    }
} finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
}
