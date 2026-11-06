import type { Handle } from '@sveltejs/kit/hooks';

import process from 'node:process';

import { json, redirect } from '@sveltejs/kit';

import {
    apiPermission,
    authConfiguration,
    SESSION_COOKIE,
    validSession,
} from '#lib/server/remote/auth';

export const handle: Handle = async ({ event, resolve }) => {
    const { pathname, search } = event.url;
    const api = pathname.startsWith('/api/');
    const publicAsset =
        pathname.startsWith('/_app/') ||
        ['/favicon.ico', '/apple-touch-icon.png'].includes(pathname);
    if (pathname === '/healthz' || publicAsset) {
        return resolve(event);
    }

    let enabled: boolean;
    try {
        enabled = authConfiguration().enabled;
    } catch {
        return new Response('Server authentication is not configured correctly.', {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    const publicUrl = process.env.NEURON404_PUBLIC_URL;
    if (publicUrl && event.url.origin !== new URL(publicUrl).origin) {
        return new Response('Invalid request origin.', {
            status: 400,
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    if (api) {
        if (!enabled) {
            return json(
                { error: 'Remote API is disabled. Configure server authentication.' },
                { status: 503 },
            );
        }
        const permission = apiPermission(event.request.headers.get('authorization'));
        if (!permission) {
            return json(
                { error: 'Authentication required.' },
                { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
            );
        }
        event.locals.apiPermission = permission;
    } else if (
        enabled &&
        pathname !== '/login' &&
        !validSession(event.cookies.get(SESSION_COOKIE))
    ) {
        throw redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
    }

    const response = await resolve(event);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'same-origin');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
};
