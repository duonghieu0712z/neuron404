import { listProposals } from '#lib/server/proposals/storage';

export const load = async () => ({ proposals: await listProposals() });
