import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import process from 'node:process';

export const SESSION_COOKIE = 'neuron404-session';
export const SESSION_SECONDS = 12 * 60 * 60;

export function authConfiguration() {
    const publicUrl = process.env.NEURON404_PUBLIC_URL;
    if (publicUrl) {
        const url = new URL(publicUrl);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash
        ) {
            throw new Error('NEURON404_PUBLIC_URL must be an HTTPS origin.');
        }
    }

    const token = process.env.NEURON404_AUTH_TOKEN ?? '';
    const readToken = process.env.NEURON404_READ_TOKEN ?? '';
    for (const secret of [token, readToken]) {
        if (secret && !/^[\x21-\x7e]{32,1024}$/.test(secret)) {
            throw new Error(
                'Authentication tokens must contain 32–1024 printable, non-whitespace ASCII characters.',
            );
        }
    }
    if ((process.env.NEURON404_PUBLIC_URL || readToken) && !token) {
        throw new Error('Server access requires NEURON404_AUTH_TOKEN.');
    }
    if (token && readToken && equalSecret(token, readToken)) {
        throw new Error('Read and write tokens must be different.');
    }

    return { token, readToken, enabled: Boolean(token) };
}

export function equalSecret(actual: string, expected: string) {
    return timingSafeEqual(
        createHash('sha256').update(actual).digest(),
        createHash('sha256').update(expected).digest(),
    );
}

export function apiPermission(authorization: string | null): 'read' | 'write' | null {
    const { token, readToken } = authConfiguration();
    const candidate = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1];
    if (!token || !candidate) {
        return null;
    }
    if (equalSecret(candidate, token)) {
        return 'write';
    }

    return readToken && equalSecret(candidate, readToken) ? 'read' : null;
}

function signature(value: string, token: string) {
    return createHmac('sha256', token).update(value).digest('hex');
}

export function createSession() {
    const { token } = authConfiguration();
    if (!token) {
        throw new Error('Authentication is not configured.');
    }

    const value = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
    return `${value}.${signature(value, token)}`;
}

export function validSession(cookie: string | undefined) {
    const { token } = authConfiguration();
    if (!token || !cookie || cookie.length > 200) {
        return false;
    }

    const parts = /^(\d+)\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(cookie);
    if (!parts) {
        return false;
    }

    const expires = Number(parts[1]);
    const now = Date.now() / 1000;
    return (
        expires > now &&
        expires <= now + SESSION_SECONDS &&
        equalSecret(parts[3], signature(`${parts[1]}.${parts[2]}`, token))
    );
}
