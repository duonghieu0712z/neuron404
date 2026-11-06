import { authConfiguration } from '#lib/server/remote/auth';

export const load = () => ({ authEnabled: authConfiguration().enabled });
