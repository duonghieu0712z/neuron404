import process from 'node:process';

import { maintenanceAgents } from './agents';

export interface MaintenanceConfig {
    provider?: string;
    cli?: string;
    model?: string;
    pollMs: number;
    settleMs: number;
    timeoutMs: number;
    maxAttempts: number;
    maxRequestsPerHour: number;
    maxBudgetUsd: number;
    maxInputBytes: number;
    auditIntervalMs: number;
}

export function readMaintenanceConfig(env = process.env): MaintenanceConfig {
    const selected = env.NEURON404_MAINTENANCE_PROVIDER?.trim().toLowerCase();
    const provider = selected && selected !== 'none' ? selected : undefined;
    if (provider && !maintenanceAgents.has(provider))
        throw new Error(`Unknown maintenance provider: ${provider}`);
    function number(
        name: string,
        fallback: number,
        minimum: number,
        maximum: number,
        integer = false,
    ) {
        const raw = provider ? env[`NEURON404_MAINTENANCE_${name}`] : undefined;
        const value = raw === undefined ? fallback : Number(raw);
        if (
            !Number.isFinite(value) ||
            value < minimum ||
            value > maximum ||
            (integer && !Number.isInteger(value))
        )
            throw new Error(
                `NEURON404_MAINTENANCE_${name} must be between ${minimum} and ${maximum}`,
            );
        return value;
    }
    return {
        provider,
        cli: provider ? env.NEURON404_MAINTENANCE_CLI?.trim() || undefined : undefined,
        model: provider ? env.NEURON404_MAINTENANCE_MODEL?.trim() || undefined : undefined,
        pollMs: number('POLL_SECONDS', 30, 1, 3600) * 1000,
        settleMs: number('SETTLE_SECONDS', 60, 0, 3600) * 1000,
        timeoutMs: number('TIMEOUT_SECONDS', 120, 1, 600) * 1000,
        maxAttempts: number('MAX_ATTEMPTS', 3, 1, 10, true),
        maxRequestsPerHour: number('MAX_REQUESTS_PER_HOUR', 4, 2, 100, true),
        maxBudgetUsd: number('MAX_BUDGET_USD', 0.5, 0.01, 100),
        maxInputBytes: number('MAX_INPUT_BYTES', 200_000, 1000, 1_000_000, true),
        auditIntervalMs: number('AUDIT_INTERVAL_DAYS', 7, 1, 365) * 24 * 60 * 60 * 1000,
    };
}
