import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DATA_DIR = path.resolve(
    process.env.NEURON404_DATA_DIR ?? path.join(homedir(), '.neuron404'),
);
export const DATABASE_URL = pathToFileURL(path.join(DATA_DIR, 'neuron404.db')).href;
export const CONTENT_DIR = path.join(DATA_DIR, 'content');
