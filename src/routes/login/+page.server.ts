import type { Actions, PageServerLoad } from './$types';

import { fail, redirect } from '@sveltejs/kit';

import {
    authConfiguration,
    createSession,
    equalSecret,
    SESSION_COOKIE,
    SESSION_SECONDS,
    validSession,
} from '#lib/server/remote/auth';

const attempts = new Map<string, { count: number; until: number }>();

function destination(url: URL) {
    const next = url.searchParams.get('next') ?? '/neurons';
    const safe =
        next.startsWith('/') &&
        !next.startsWith('//') &&
        !next.includes('\\') &&
        !/[\r\n]/.test(next) &&
        !next.startsWith('/login');
    return safe ? next : '/neurons';
}

export const load: PageServerLoad = ({ cookies, url }) => {
    if (!authConfiguration().enabled || validSession(cookies.get(SESSION_COOKIE))) {
        throw redirect(303, destination(url));
    }
};

export const actions: Actions = {
    default: async ({ request, cookies, url, getClientAddress }) => {
        const { token } = authConfiguration();
        if (!token) {
            return fail(503, { error: 'Authentication is not configured.' });
        }

        const now = Date.now();
        for (const [key, value] of attempts) {
            if (value.until <= now) {
                attempts.delete(key);
            }
        }

        const address = getClientAddress();
        const attempt = attempts.get(address);
        if ((attempt?.count ?? 0) >= 5 || attempts.size >= 10000) {
            return fail(429, { error: 'Too many attempts. Try again in 15 minutes.' });
        }

        const value = (await request.formData()).get('token');
        if (typeof value !== 'string' || value.length > 1024 || !equalSecret(value, token)) {
            attempts.set(address, {
                count: (attempt?.count ?? 0) + 1,
                until: attempt?.until ?? now + 15 * 60 * 1000,
            });
            return fail(400, { error: 'Invalid access token.' });
        }

        attempts.delete(address);
        cookies.set(SESSION_COOKIE, createSession(), {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: url.protocol === 'https:',
            maxAge: SESSION_SECONDS,
        });
        throw redirect(303, destination(url));
    },
};
