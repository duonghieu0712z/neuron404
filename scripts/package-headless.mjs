import { execFileSync } from 'node:child_process';
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
for (const file of ['README.md', 'LICENSE']) {
    await cp(path.join(root, file), path.join(target, file));
}
await writeFile(
    path.join(target, 'build.json'),
    JSON.stringify({
        version: original.version,
        revision: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
        }).trim(),
    }) + '\n',
);
await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify(
        {
            name: '@duonghieu0712z/neuron404',
            version: original.version,
            description: 'Local-first knowledge storage and retrieval for AI agents',
            license: original.license,
            author: original.author,
            repository: {
                type: 'git',
                url: 'git+https://github.com/duonghieu0712z/neuron404.git',
            },
            homepage: 'https://github.com/duonghieu0712z/neuron404#readme',
            type: 'module',
            bin: { neuron404: 'bin/neuron404.mjs' },
            files: [
                'bin',
                'dist',
                'drizzle',
                'skills/neuron404',
                'build.json',
                'README.md',
                'LICENSE',
            ],
            publishConfig: { access: 'public' },
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
