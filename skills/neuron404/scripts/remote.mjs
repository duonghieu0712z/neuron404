#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';

const MAX_BODY_BYTES = 1024 * 1024;
const writes = new Set(['add', 'update', 'region:add', 'region:write', 'source:add']);
const reads = new Set([
    'read',
    'neighbors',
    'history',
    'catalog',
    'search',
    'region:read',
    'source:read',
    'review:reports',
    'review:read',
]);

function serverOrigin() {
    const url = new URL(process.env.NEURON404_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error(
            'NEURON404_URL must be a server origin without credentials, path, query or fragment.',
        );
    }

    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
        throw new Error('Remote access requires HTTPS. HTTP is allowed only on loopback.');
    }

    return url;
}

function requestHeaders(requestId) {
    const token = process.env.NEURON404_TOKEN;
    if (!token) {
        throw new Error('Set NEURON404_TOKEN for remote access.');
    }
    if (!/^[\x21-\x7e]{32,1024}$/.test(token)) {
        throw new Error(
            'NEURON404_TOKEN must contain 32–1024 printable, non-whitespace ASCII characters.',
        );
    }

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (requestId) {
        headers['Idempotency-Key'] = requestId;
    }

    const cloudflareId = process.env.CF_ACCESS_CLIENT_ID;
    const cloudflareSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    if (Boolean(cloudflareId) !== Boolean(cloudflareSecret)) {
        throw new Error('Set both Cloudflare Access credentials or neither.');
    }
    if (cloudflareId) {
        if (
            ![cloudflareId, cloudflareSecret].every((value) => /^[\x21-\x7e]{1,4096}$/.test(value))
        ) {
            throw new Error('Invalid Cloudflare Access credential format.');
        }
        headers['CF-Access-Client-Id'] = cloudflareId;
        headers['CF-Access-Client-Secret'] = cloudflareSecret;
    }

    return headers;
}

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

    const url = serverOrigin();
    const headers = requestHeaders(requestId);
    const payload = writes.has(command) ? await readPayload() : undefined;
    const body = JSON.stringify({ command, args, ...(payload === undefined ? {} : { payload }) });
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        throw new Error('Request exceeds 1 MiB.');
    }

    const response = await fetch(new URL('/api/v1/commands', url), {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(
            'Server returned a non-JSON response. Check the endpoint and access policy.',
        );
    }

    const result = await response.json();
    if (!response.ok) {
        throw new Error(
            typeof result.error === 'string'
                ? result.error
                : `Request failed (${response.status}).`,
        );
    }

    return result;
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
