import type { MaintenanceAgentAdapter } from './types';

import { claudeAgent } from './claude';
import { codexAgent } from './codex';

export const maintenanceAgents: ReadonlyMap<string, MaintenanceAgentAdapter> = new Map(
    [claudeAgent, codexAgent].map((adapter) => [adapter.id, adapter]),
);

export type {
    MaintenanceAgentAdapter,
    MaintenanceAgentInvocation,
    MaintenanceAgentRequest,
} from './types';
