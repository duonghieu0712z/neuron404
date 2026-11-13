#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const [command, ...args] = process.argv.slice(2);

if (command === '--version' || command === '-v') {
    const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

    console.log(version);
} else if (command === '--help' || command === '-h' || !command) {
    console.log(`Usage: neuron404 <command> [arguments]

Knowledge: search, catalog, read, neighbors, history, add, update
Evidence: source:add, source:read
Proposals: proposal:add, proposal:read, proposal:list
Regions: region:add, region:read, region:write, region:path:read, region:path:write
Administration: migrate, index, lint, sync, maintenance, serve
Direct server access: remote <command> [arguments]

Run "neuron404 migrate" once before using a new local store.
Local data defaults to ~/.neuron404. The web interface is optional.`);
} else {
    process.chdir(fileURLToPath(root));

    let entry = new URL('dist/neuron.js', root);
    let forwarded = [command, ...args];

    if (command === 'remote') {
        entry = new URL('skills/neuron404/scripts/remote.mjs', root);
        forwarded = args;
    } else if (command === 'serve') {
        entry = new URL('dist/server.js', root);
        forwarded = args;
    } else if (command === 'maintenance') {
        entry = new URL('dist/maintenance.js', root);
        forwarded = args;
    }

    process.argv = [process.execPath, fileURLToPath(entry), ...forwarded];
    await import(entry.href);
}
