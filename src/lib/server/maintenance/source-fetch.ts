import { lookup } from 'node:dns/promises';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sanitizeHtml from 'sanitize-html';

const blocked = new BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['100.64.0.0', 10],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
] as const) {
    blocked.addSubnet(address, prefix, 'ipv4');
}

export async function publicAddress(hostname: string) {
    const host = hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await lookup(host, { all: true });
    if (
        !addresses.length ||
        addresses.some(({ address, family }) =>
            family === 4
                ? blocked.check(address, 'ipv4')
                : !/^2[0-9a-f]{3}:/i.test(address) ||
                  /^2001:(?:0:|db8:|10:|20:)/i.test(address) ||
                  /^2002:/i.test(address),
        )
    ) {
        throw new Error('Source address is not public.');
    }
    return addresses[0];
}

export async function readRegisteredSource(uri: string) {
    const roots = JSON.parse(process.env.NEURON404_SOURCE_ROOTS ?? '[]') as unknown;
    if (!Array.isArray(roots) || roots.some((root) => typeof root !== 'string')) {
        throw new Error('Invalid registered source roots.');
    }
    const filename = await realpath(uri.startsWith('file:') ? fileURLToPath(uri) : uri);
    const directories = await Promise.all(roots.map((root: string) => realpath(root)));
    if (!directories.some((root) => filename.startsWith(root + path.sep))) {
        throw new Error('File source is outside registered roots.');
    }
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
            throw new Error('Registered source must be a regular file.');
        }
        if (stat.size > 512000) {
            throw new Error('File source exceeds 512 KB.');
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of handle.createReadStream({ autoClose: false })) {
            size += chunk.length;
            if (size > 512000) {
                throw new Error('File source exceeds 512 KB.');
            }
            chunks.push(chunk);
        }
        const types: Record<string, string> = {
            '.md': 'text/markdown',
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.html': 'text/html',
        };
        return {
            status: 200,
            headers: {
                'content-type': types[path.extname(filename)] ?? 'application/octet-stream',
            } as Record<string, string>,
            raw: Buffer.concat(chunks),
            url: uri,
        };
    } finally {
        await handle.close();
    }
}

export async function fetchPublicSource(
    uri: string,
    validators: Record<string, string> = {},
    signal?: AbortSignal,
) {
    const timeout = AbortSignal.timeout(15000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let url = new URL(uri);
    for (let redirects = 0; redirects <= 4; redirects++) {
        combined.throwIfAborted();
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            (url.port && !['80', '443'].includes(url.port))
        ) {
            throw new Error('Unsupported source URL.');
        }
        const resolved = await publicAddress(url.hostname);
        const response = await new Promise<{
            status: number;
            headers: Record<string, string>;
            raw: Buffer;
        }>((resolve, reject) => {
            const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
                url,
                {
                    signal: combined,
                    headers: {
                        Accept: 'text/plain, text/html, application/json',
                        'Accept-Encoding': 'identity',
                        ...validators,
                    },
                    // Pin the validated address to avoid DNS rebinding between validation and connect.
                    lookup: (_host, options, callback) => {
                        if (typeof options === 'object' && options.all) {
                            const complete = callback as unknown as (
                                error: Error | null,
                                addresses: { address: string; family: number }[],
                            ) => void;
                            complete(null, [resolved]);
                        } else {
                            callback(null, resolved.address, resolved.family);
                        }
                    },
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    let size = 0;
                    response.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > 512000) {
                            request.destroy(new Error('Source exceeds 512 KB.'));
                        } else {
                            chunks.push(chunk);
                        }
                    });
                    response.on('error', reject);
                    response.on('end', () =>
                        resolve({
                            status: response.statusCode ?? 0,
                            headers: Object.fromEntries(
                                Object.entries(response.headers).filter(
                                    (entry): entry is [string, string] =>
                                        typeof entry[1] === 'string',
                                ),
                            ),
                            raw: Buffer.concat(chunks),
                        }),
                    );
                },
            );
            request.on('error', reject);
            request.end();
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (!response.headers.location || redirects === 4) {
                throw new Error('Source redirect limit exceeded.');
            }
            const next = new URL(response.headers.location, url);
            if (next.origin !== url.origin) {
                validators = {};
            }
            url = next;
            continue;
        }
        return { ...response, url: url.href };
    }
    throw new Error('Source redirect limit exceeded.');
}

export function extractSource(raw: Buffer, contentType: string) {
    const type = contentType.split(';')[0].trim().toLowerCase();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if (type === 'application/json' || type.endsWith('+json')) {
        JSON.parse(text);
        return text;
    }
    if (type === 'text/plain' || type === 'text/markdown') {
        return text;
    }
    if (type === 'text/html') {
        const result = sanitizeHtml(
            text
                .replace(/<(br|hr)\b[^>]*>/gi, '\n')
                .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, '\n'),
            {
                allowedTags: [],
                allowedAttributes: {},
                nonTextTags: ['script', 'style', 'textarea', 'noscript'],
            },
        ).trim();
        if (result.length < 100) {
            throw new Error(
                'HTML has insufficient readable content; login or JavaScript may be required.',
            );
        }
        return result;
    }
    throw new Error(`Unsupported source format: ${type || 'unknown'}`);
}
