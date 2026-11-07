import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'headless');
const original = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await rm(target, { recursive: true, force: true });
await mkdir(target);
for (const directory of ['dist', 'drizzle', 'bin', 'skills']) {
    await cp(path.join(root, directory), path.join(target, directory), { recursive: true });
}
await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify(
        {
            name: original.name,
            version: original.version,
            private: true,
            type: 'module',
            engines: original.engines,
            packageManager: original.packageManager,
            dependencies: original.dependencies,
            scripts: { neuron: 'node dist/neuron.js', start: 'node dist/server.js' },
        },
        null,
        4,
    ) + '\n',
);
console.log(
    'Headless package ready in headless/. Install production dependencies there before use.',
);
