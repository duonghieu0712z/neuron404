import type { MaintenanceAgentAdapter } from './types';

import { z } from 'zod';

export const claudeAgent: MaintenanceAgentAdapter = {
    id: 'claude',
    defaultExecutable: 'claude',
    supportsBudgetUsd: true,
    async prepare({ input, systemPrompt, schema, config }) {
        return {
            executable: config.cli ?? 'claude',
            args: [
                '--print',
                '--safe-mode',
                '--tools',
                '',
                '--strict-mcp-config',
                '--mcp-config',
                '{"mcpServers":{}}',
                '--disable-slash-commands',
                '--no-session-persistence',
                '--permission-mode',
                'dontAsk',
                '--output-format',
                'json',
                '--json-schema',
                JSON.stringify(schema),
                ...(config.model ? ['--model', config.model] : []),
                '--max-budget-usd',
                String(config.maxBudgetUsd),
                '--system-prompt',
                systemPrompt,
            ],
            input,
            env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
            async readOutput(stdout) {
                const result = z
                    .object({ is_error: z.boolean().optional(), structured_output: z.unknown() })
                    .parse(JSON.parse(stdout));
                if (result.is_error || result.structured_output === undefined) {
                    throw new Error('Claude CLI did not return a successful structured result.');
                }
                return result.structured_output;
            },
        };
    },
};
