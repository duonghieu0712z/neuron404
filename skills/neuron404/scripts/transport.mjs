import process from 'node:process';

import { loadFileSecrets } from './file-secrets.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

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
    loadFileSecrets();
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

export async function requestRemote(command, args = [], payload, requestId) {
    const url = serverOrigin();
    const headers = requestHeaders(requestId);
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
