import './env';

import { createServer } from 'node:http';
import process from 'node:process';

import { apiPermission, authConfiguration } from '#lib/server/remote/auth';
import { handleCommand } from '#lib/server/remote/commands';

if (!authConfiguration().enabled) {
    throw new Error('The API server requires NEURON404_AUTH_TOKEN.');
}

const server = createServer(async (incoming, outgoing) => {
    const respond = async (response: Response) => {
        response.headers.set('Cache-Control', 'no-store');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
    };
    try {
        if (incoming.url === '/healthz' && incoming.method === 'GET') {
            await respond(Response.json({ status: 'ok' }));
            return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) {
                headers.set(name, Array.isArray(value) ? value.join(', ') : value);
            }
        }
        const publicUrl = process.env.NEURON404_PUBLIC_URL;
        if (publicUrl && headers.get('host') !== new URL(publicUrl).host) {
            await respond(Response.json({ error: 'Invalid request origin.' }, { status: 400 }));
            return;
        }
        if (incoming.url !== '/api/v1/commands' || incoming.method !== 'POST') {
            await respond(Response.json({ error: 'Not found.' }, { status: 404 }));
            return;
        }
        const permission = apiPermission(headers.get('authorization'));
        if (!permission) {
            await respond(Response.json({ error: 'Authentication required.' }, { status: 401 }));
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
            size += chunk.length;
            if (size > 1024 * 1024) {
                await respond(
                    Response.json({ error: 'Request body exceeds 1 MiB.' }, { status: 413 }),
                );
                return;
            }
            chunks.push(chunk);
        }
        const request = new Request('http://localhost/api/v1/commands', {
            method: 'POST',
            headers,
            body: Buffer.concat(chunks),
        });
        await respond(await handleCommand(request, permission));
    } catch (cause) {
        console.error('API request failed:', cause);
        if (!outgoing.headersSent) {
            await respond(Response.json({ error: 'Operation failed.' }, { status: 500 }));
        } else {
            outgoing.end();
        }
    }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => server.close());
}
