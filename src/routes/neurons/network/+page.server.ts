import type { PageServerLoad } from './$types';

import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: PageServerLoad = ({ url }) => {
    throw redirect(308, resolve(url.search ? `/network?${url.searchParams}` : '/network'));
};
