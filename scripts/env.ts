import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { loadFileSecrets } from '../skills/neuron404/scripts/file-secrets.mjs';

const envPath = path.join(import.meta.dirname, '../.env');
if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

loadFileSecrets();
