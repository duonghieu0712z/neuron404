import { readMaintenanceConfig } from './config';
import { runMaintenancePass } from './worker';

const runtime = globalThis as typeof globalThis & { neuron404Maintenance?: AbortController };

export function startMaintenance() {
    if (runtime.neuron404Maintenance) {
        return;
    }
    const config = readMaintenanceConfig();
    if (!config.provider) {
        return;
    }
    const controller = new AbortController();
    runtime.neuron404Maintenance = controller;
    const run = async () => {
        try {
            await runMaintenancePass(config, controller.signal);
        } catch (error) {
            if (!controller.signal.aborted) {
                console.error('Maintenance failed:', error);
            }
        }
        if (!controller.signal.aborted) {
            setTimeout(() => {
                void run();
            }, config.pollMs).unref();
        }
    };
    setTimeout(() => {
        void run();
    }, 0).unref();
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => controller.abort());
    }
}
