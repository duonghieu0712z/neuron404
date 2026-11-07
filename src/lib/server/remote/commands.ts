import type { CommandResponse } from '#lib/server/remote/requests';

import { z, ZodError } from 'zod';

import {
    executeNeuronCommand,
    REMOTE_READ_COMMANDS,
    REMOTE_WRITE_COMMANDS,
} from '#lib/server/neuron/commands';
import { executeOnce } from '#lib/server/remote/requests';

const commandSchema = z
    .object({
        command: z.enum([...REMOTE_READ_COMMANDS, ...REMOTE_WRITE_COMMANDS]),
        args: z.array(z.string().max(4096)).max(100).default([]),
        payload: z.unknown().optional(),
    })
    .strict();
const MAX_BODY_BYTES = 1024 * 1024;

async function parseCommandRequest(request: Request) {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
        throw new Error('Invalid content type. Use application/json.');
    }

    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
        throw new Error('Request body exceeds 1 MiB.');
    }

    const reader = request.body?.getReader();
    if (!reader) {
        throw new Error('Invalid empty request.');
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
                await reader.cancel();
                throw new Error('Request body exceeds 1 MiB.');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    return commandSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

function failure(cause: unknown): CommandResponse {
    if (cause instanceof ZodError) {
        return {
            status: 400,
            body: {
                error: 'Invalid command input.',
                issues: cause.issues.map(({ path, message }) => ({ path, message })),
            },
        };
    }
    if (cause instanceof SyntaxError) {
        return { status: 400, body: { error: 'Invalid JSON.' } };
    }

    const message = cause instanceof Error ? cause.message : '';
    if (
        /conflict|locked|changed.*retry|Region members changed|already exists|already registered/i.test(
            message,
        )
    ) {
        return { status: 409, body: { error: message } };
    }
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT' || /not found/i.test(message)) {
        return { status: 404, body: { error: 'Requested knowledge was not found.' } };
    }
    if (
        message === 'Request body exceeds 1 MiB.' ||
        (cause as { status?: number })?.status === 413
    ) {
        return { status: 413, body: { error: 'Request body exceeds the server body-size limit.' } };
    }
    if (
        /^(Invalid|Unknown|Search accepts|Search limit|Search offset|Limit must|Read requires|Catalog requires|Neighbors requires|Missing value|A superseded|A Region overview must|Overview citation|Supersession)/.test(
            message,
        )
    ) {
        return { status: 400, body: { error: message } };
    }
    console.error('Remote command failed:', cause);
    return {
        status: 500,
        body: {
            error: 'Operation failed. Inspect server logs and stored knowledge before retrying.',
        },
    };
}

export async function handleCommand(request: Request, permission: 'read' | 'write') {
    try {
        const command = await parseCommandRequest(request);
        const write = (REMOTE_WRITE_COMMANDS as readonly string[]).includes(command.command);
        if (write && permission !== 'write') {
            return Response.json({ error: 'Write permission required.' }, { status: 403 });
        }

        const execute = async (): Promise<CommandResponse> => {
            try {
                return {
                    status: 200,
                    body: await executeNeuronCommand(
                        command.command,
                        command.args,
                        command.payload,
                    ),
                };
            } catch (cause) {
                return failure(cause);
            }
        };

        let result: CommandResponse;
        if (write) {
            const key = request.headers.get('idempotency-key');
            if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
                return Response.json(
                    {
                        error: 'Writes require an Idempotency-Key of 16–128 letters, digits, underscores or hyphens.',
                    },
                    { status: 400 },
                );
            }
            result = await executeOnce(key, command, execute);
        } else {
            result = await execute();
        }

        return Response.json(result.body, {
            status: result.status,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (cause) {
        const result = failure(cause);
        return Response.json(result.body, {
            status: result.status,
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}
