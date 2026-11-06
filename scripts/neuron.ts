import './env';

import process from 'node:process';

import { executeNeuronCommand } from '#lib/server/neuron/commands';

const [command, ...args] = process.argv.slice(2);
try {
    let payload: unknown;
    if (['add', 'update', 'source:add', 'region:add', 'region:write'].includes(command)) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
        }
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    const result = await executeNeuronCommand(command, args, payload);
    console.log(JSON.stringify(result, null, 2));
    if (command === 'lint' && (result as unknown[]).length) {
        process.exitCode = 1;
    }
} catch (error) {
    console.error(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    );
    process.exitCode = 1;
}
