import type { MaintenanceAgentAdapter } from './types';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const codexAgent: MaintenanceAgentAdapter = {
    id: 'codex',
    defaultExecutable: 'codex',
    supportsBudgetUsd: false,
    async prepare({ input, systemPrompt, schema, directory, config }) {
        const schemaPath = path.join(directory, 'schema.json');
        const outputPath = path.join(directory, 'result.json');
        await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 });
        const disabled = [
            'shell_tool',
            'apps',
            'plugins',
            'hooks',
            'multi_agent',
            'browser_use',
            'computer_use',
            'image_generation',
            'view_image',
            'code_mode',
            'skill_search',
            'skill_mcp_dependency_install',
        ];
        return {
            executable: config.cli ?? 'codex',
            args: [
                'exec',
                '--ephemeral',
                '--ignore-user-config',
                '--ignore-rules',
                '--skip-git-repo-check',
                '--sandbox',
                'read-only',
                '--cd',
                directory,
                '--json',
                '--color',
                'never',
                '--output-schema',
                schemaPath,
                '--output-last-message',
                outputPath,
                '--config',
                'approval_policy="never"',
                '--config',
                'web_search="disabled"',
                '--config',
                'project_doc_max_bytes=0',
                '--config',
                'skills.include_instructions=false',
                '--config',
                'skills.bundled.enabled=false',
                '--config',
                `developer_instructions=${JSON.stringify(systemPrompt)}`,
                ...disabled.flatMap((feature) => ['--disable', feature]),
                ...(config.model ? ['--model', config.model] : []),
                '-',
            ],
            input,
            async readOutput() {
                const output = await readFile(outputPath, 'utf8');
                if (Buffer.byteLength(output) > 1_000_000)
                    throw new Error('Codex output exceeded the size limit.');
                return JSON.parse(output) as unknown;
            },
        };
    },
};
