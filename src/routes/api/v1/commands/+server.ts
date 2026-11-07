import type { RequestHandler } from './$types';

import { handleCommand } from '#lib/server/remote/commands';

export const POST: RequestHandler = ({ request, locals }) =>
    handleCommand(request, locals.apiPermission ?? 'read');
