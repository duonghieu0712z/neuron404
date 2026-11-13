import type { Receipt } from './release/artifacts.ts';

import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    artifact,
    git,
    original,
    pack,
    repository,
    root,
    target,
    verify,
} from './release/artifacts.ts';

const [command, sourceDirectory] = process.argv.slice(2);

if (command === 'verify' && sourceDirectory) {
    await verify(path.resolve(sourceDirectory), original.version);
    console.log('Release artifacts verified.');
} else if (command === 'pack' || (command === 'promote' && sourceDirectory)) {
    if (
        sourceDirectory &&
        (path.resolve(sourceDirectory) === target ||
            path.resolve(sourceDirectory).startsWith(target + path.sep))
    ) {
        throw new Error('Keep prerelease input archives outside the artifacts output directory.');
    }

    await rm(target, { recursive: true, force: true });
    await mkdir(target);
    const cliFile = `neuron404-cli-${original.version}.tgz`;
    const skillFile = `neuron404-skill-${original.version}.tgz`;
    let buildVersion = original.version;
    let buildRevision = git('rev-parse', 'HEAD');

    if (command === 'pack') {
        const headless = path.join(root, 'headless');
        const manifest = JSON.parse(await readFile(path.join(headless, 'package.json'), 'utf8'));
        const build = JSON.parse(await readFile(path.join(headless, 'build.json'), 'utf8'));

        if (
            manifest.version !== original.version ||
            build.version !== original.version ||
            build.revision !== buildRevision
        ) {
            throw new Error('Build the headless distribution for this version and commit first.');
        }

        pack(headless, cliFile);
        execFileSync('tar', [
            '-czf',
            path.join(target, skillFile),
            '-C',
            path.join(root, 'skills'),
            'neuron404',
        ]);
    } else {
        const source = path.resolve(sourceDirectory!);
        const sourceTag = process.env.SOURCE_TAG;

        if (!sourceTag?.startsWith(`v${original.version}-`) || original.version.includes('-')) {
            throw new Error('Select a prerelease of the matching stable version.');
        }

        const receipt = await verify(source, sourceTag.slice(1));
        const image = JSON.parse(await readFile(path.join(source, 'image.json'), 'utf8'));

        if (
            receipt.buildVersion !== receipt.version ||
            receipt.buildVersion !== image.buildVersion ||
            receipt.buildRevision !== receipt.releaseRevision ||
            receipt.buildRevision !== image.buildRevision
        ) {
            throw new Error(
                'The CLI, skill and image must come from the same original prerelease build.',
            );
        }

        git('merge-base', '--is-ancestor', receipt.buildRevision, git('rev-parse', 'HEAD'));
        buildVersion = receipt.buildVersion;
        buildRevision = receipt.buildRevision;
        const temporary = await mkdtemp(path.join(tmpdir(), 'neuron404-package-'));

        try {
            execFileSync('tar', ['-xzf', path.join(source, receipt.cli.file), '-C', temporary]);
            const directory = path.join(temporary, 'package');
            const manifestPath = path.join(directory, 'package.json');
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            manifest.version = original.version;
            await writeFile(manifestPath, JSON.stringify(manifest, null, 4) + '\n');
            pack(directory, cliFile);
            await cp(path.join(source, receipt.skill.file), path.join(target, skillFile));
        } finally {
            await rm(temporary, { recursive: true, force: true });
        }
    }

    const receipt: Receipt = {
        schema: 1,
        repository,
        version: original.version,
        releaseRevision: git('rev-parse', 'HEAD'),
        buildVersion,
        buildRevision,
        cli: await artifact(target, cliFile),
        skill: await artifact(target, skillFile),
    };
    await writeFile(
        path.join(target, 'release-artifacts.json'),
        JSON.stringify(receipt, null, 2) + '\n',
    );
    console.log(`Release archives ready in ${target}.`);
} else {
    throw new Error(
        'Usage: pnpm package:release, pnpm package:verify DIRECTORY, or pnpm package:promote DIRECTORY',
    );
}
