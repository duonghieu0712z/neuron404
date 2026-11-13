import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface Artifact {
    file: string;
    sha256: string;
}

export interface Receipt {
    schema: 1;
    repository: string;
    version: string;
    releaseRevision: string;
    buildVersion: string;
    buildRevision: string;
    cli: Artifact;
    skill: Artifact;
}

export const root = path.resolve(import.meta.dirname, '../..');
export const target = path.join(root, 'artifacts');
export const original = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
export const repository = process.env.GITHUB_REPOSITORY ?? 'duonghieu0712z/neuron404';
export const cliName = '@duonghieu0712z/neuron404';

export const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export async function artifact(directory: string, file: string): Promise<Artifact> {
    const bytes = await readFile(path.join(directory, file));
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function verify(directory: string, version: string): Promise<Receipt> {
    const receipt: Receipt = JSON.parse(
        await readFile(path.join(directory, 'release-artifacts.json'), 'utf8'),
    );

    if (
        receipt.schema !== 1 ||
        receipt.repository !== repository ||
        receipt.version !== version ||
        receipt.releaseRevision !== git('rev-parse', '--verify', `v${version}^{commit}`) ||
        receipt.cli?.file !== `neuron404-cli-${version}.tgz` ||
        receipt.skill?.file !== `neuron404-skill-${version}.tgz`
    ) {
        throw new Error('The artifact receipt does not match the release repository or Git tag.');
    }

    for (const entry of [receipt.cli, receipt.skill]) {
        if ((await artifact(directory, entry.file)).sha256 !== entry.sha256) {
            throw new Error(`Artifact checksum mismatch: ${entry.file}`);
        }
    }

    const manifest = JSON.parse(
        execFileSync(
            'tar',
            ['-xOf', path.join(directory, receipt.cli.file), 'package/package.json'],
            {
                encoding: 'utf8',
            },
        ),
    );

    if (manifest.name !== cliName || manifest.version !== version || manifest.private) {
        throw new Error('The CLI archive does not contain the expected public package.');
    }

    const build = JSON.parse(
        execFileSync(
            'tar',
            ['-xOf', path.join(directory, receipt.cli.file), 'package/build.json'],
            {
                encoding: 'utf8',
            },
        ),
    );

    if (build.version !== receipt.buildVersion || build.revision !== receipt.buildRevision) {
        throw new Error('The CLI build identity does not match the artifact receipt.');
    }

    return receipt;
}

export function pack(directory: string, file: string) {
    const executable = process.env.npm_execpath;

    if (!executable) {
        throw new Error(
            'Run packaging through pnpm so the package manager executable is available.',
        );
    }

    const args = ['pack', '--out', path.join(target, file)];

    if (/\.[cm]?js$/.test(executable)) {
        execFileSync(process.execPath, [executable, ...args], { cwd: directory, stdio: 'inherit' });
    } else {
        execFileSync(executable, args, { cwd: directory, stdio: 'inherit' });
    }
}
