import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(import.meta.dirname, '../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
