import path from 'node:path';
import process from 'node:process';

process.loadEnvFile(path.join(import.meta.dirname, '../.env'));
