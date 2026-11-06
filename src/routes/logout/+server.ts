import type { RequestHandler } from './$types';

import { error, redirect } from '@sveltejs/kit';

import { SESSION_COOKIE } from '#lib/server/remote/auth';

export const POST: RequestHandler = ({ request, url, cookies }) => {
    if (request.headers.get('origin') !== url.origin) {
        error(403, 'Invalid request origin.');
    }
    cookies.delete(SESSION_COOKIE, { path: '/' });
    throw redirect(303, '/login');
};
