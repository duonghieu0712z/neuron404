import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { readMaintenanceConfig } from '#lib/server/maintenance/config';
import { retryFailedMaintenance, runMaintenancePass } from '#lib/server/maintenance/worker';

export async function runWorker(args: string[], signal: AbortSignal, log: (value: object) => void) {
    const config = readMaintenanceConfig();

    if (!config.provider) {
        log({ status: 'disabled', reason: 'No maintenance provider configured.' });
    } else {
        if (args.includes('--audit') && args.includes('--overview')) {
            throw new Error('Choose audit or overview, not both.');
        }

        let mode: 'knowledge' | 'overview' | 'all' = 'all';

        if (args.includes('--audit')) {
            mode = 'knowledge';
        } else if (args.includes('--overview')) {
            mode = 'overview';
        }

        const once = args.includes('--once');

        if (once) {
            config.settleMs = 0;
        }

        if (args.includes('--retry-failed')) {
            log(await retryFailedMaintenance());
        }

        log({
            status: 'started',
            provider: config.provider,
            model: config.model ?? null,
            once,
            mode,
        });
        do {
            try {
                const result = await runMaintenancePass(config, signal, undefined, mode);

                if (result.status !== 'idle' || once) {
                    log(result);
                }

                if (once && result.status === 'failed') {
                    process.exitCode = 1;
                }
            } catch (error) {
                if (signal.aborted) {
                    break;
                }

                log({
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                });

                if (once) {
                    process.exitCode = 1;
                }
            }

            if (once || signal.aborted) {
                break;
            }

            await setTimeout(config.pollMs, undefined, { signal: signal });
        } while (!signal.aborted);
    }
}
