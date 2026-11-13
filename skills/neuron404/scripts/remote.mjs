#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { requestRemote } from './transport.mjs';

const MAX_BODY_BYTES = 1024 * 1024;
const writes = new Set([
    'add',
    'update',
    'region:add',
    'region:update',
    'region:write',
    'source:add',
    'proposal:add',
    'region:path:write',
    'sync:write',
]);
const reads = new Set([
    'read',
    'proposal:read',
    'proposal:list',
    'region:path:read',
    'neighbors',
    'history',
    'catalog',
    'search',
    'region:read',
    'source:read',
    'review:reports',
    'review:read',
    'sync:manifest',
    'sync:read',
]);

async function readPayload() {
    const chunks = [];
    let size = 0;

    for await (const chunk of process.stdin) {
        size += chunk.length;

        if (size > MAX_BODY_BYTES) {
            throw new Error('Payload exceeds 1 MiB.');
        }

        chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function execute(command, args, requestId) {
    if (!writes.has(command) && !reads.has(command)) {
        throw new Error(
            'Unsupported remote command. Indexing, migration and lint run on the server locally.',
        );
    }

    const payload = writes.has(command) ? await readPayload() : undefined;

    return requestRemote(command, args, payload, requestId);
}

const [command, ...args] = process.argv.slice(2);
const requestId = writes.has(command)
    ? process.env.NEURON404_REQUEST_ID || randomUUID()
    : undefined;

try {
    console.log(JSON.stringify(await execute(command, args, requestId), null, 2));
} catch (cause) {
    const failure = { error: cause instanceof Error ? cause.message : String(cause) };

    if (requestId) {
        failure.requestId = requestId;
        failure.recovery =
            'The write may have reached the server. Reuse NEURON404_REQUEST_ID with identical input to retrieve its outcome; inspect uncertain writes before using a new ID.';
    }

    console.error(JSON.stringify(failure));
    process.exitCode = 1;
}
