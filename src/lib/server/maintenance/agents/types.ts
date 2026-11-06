import type { MaintenanceConfig } from '../config';

export interface MaintenanceAgentRequest {
    input: string;
    systemPrompt: string;
    schema: object;
    directory: string;
    config: MaintenanceConfig;
}

export interface MaintenanceAgentInvocation {
    executable: string;
    args: string[];
    input: string;
    env?: Record<string, string>;
    readOutput(stdout: string): Promise<unknown>;
}

export interface MaintenanceAgentAdapter {
    readonly id: string;
    readonly defaultExecutable: string;
    readonly supportsBudgetUsd: boolean;
    prepare(request: MaintenanceAgentRequest): Promise<MaintenanceAgentInvocation>;
}
