import './env';

import type { IncomingMessage } from 'node:http';

import process from 'node:process';

import { authConfiguration } from '#lib/server/remote/auth';

// Validate before listening; keep the same image usable locally and behind HTTPS proxies.
authConfiguration();
process.env.PROTOCOL_HEADER ||= 'x-forwarded-proto';
process.env.BODY_SIZE_LIMIT ||= '1M';

const protocolHeader = process.env.PROTOCOL_HEADER.toLowerCase();
const fallbackProtocol = process.env.NEURON404_PUBLIC_URL ? 'https' : 'http';

const entry = new URL('../build/index.js', import.meta.url);
const { server } = await import(/* @vite-ignore */ entry.href);

server.prependListener('request', (request: IncomingMessage) => {
    if (!request.headers[protocolHeader]) {
        request.headers[protocolHeader] = fallbackProtocol;
    }
});
