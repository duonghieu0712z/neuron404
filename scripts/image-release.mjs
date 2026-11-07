import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
/** @param {...string} args */
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must identify the release repository.');
}

const image = `ghcr.io/${repository.toLowerCase()}`;
const revision = git('rev-parse', 'HEAD').trim();
const digestPattern = /^sha256:[a-f0-9]{64}$/;
let receipt;

if (process.argv[2] === 'record' && process.argv.length === 3) {
    const digest = process.env.IMAGE_DIGEST;
    if (!digest || !digestPattern.test(digest)) {
        throw new Error('IMAGE_DIGEST must be the published multi-platform image digest.');
    }
    receipt = {
        schema: 1,
        repository,
        image,
        releaseVersion: version,
        releaseRevision: revision,
        buildVersion: version,
        buildRevision: revision,
        digest,
    };
} else if (process.argv[2] === 'promote' && process.argv.length === 4) {
    const sourceTag = process.env.SOURCE_TAG;
    const source = JSON.parse(await readFile(process.argv[3], 'utf8'));
    const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
    if (!stableVersion.test(version) || !sourceTag || !sourceTag.startsWith(`v${version}-`)) {
        throw new Error('Promote a prerelease tag to its matching stable version.');
    }
    if (
        source.schema !== 1 ||
        source.repository !== repository ||
        source.image !== image ||
        typeof source.digest !== 'string' ||
        !digestPattern.test(source.digest) ||
        source.releaseVersion !== source.buildVersion ||
        source.releaseRevision !== source.buildRevision ||
        sourceTag !== `v${source.buildVersion}`
    ) {
        throw new Error('The source must have an original build receipt from this repository.');
    }

    const sourceRevision = git('rev-parse', '--verify', `${sourceTag}^{commit}`).trim();
    if (source.buildRevision !== sourceRevision) {
        throw new Error('The source receipt does not match the prerelease Git tag.');
    }
    git('merge-base', '--is-ancestor', sourceRevision, revision);

    const sourcePackage = JSON.parse(git('show', `${sourceRevision}:package.json`));
    const targetPackage = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    if (sourcePackage.version !== source.buildVersion) {
        throw new Error('The prerelease package version does not match its image receipt.');
    }
    delete sourcePackage.version;
    delete targetPackage.version;
    if (JSON.stringify(sourcePackage) !== JSON.stringify(targetPackage)) {
        throw new Error('Only the package version may change during promotion.');
    }

    const paths = git('diff', '--name-only', '-z', sourceRevision, revision)
        .split('\0')
        .filter(Boolean);
    const changedCode = paths.filter(
        (path) =>
            !['package.json', 'CHANGELOG.md', 'README.md'].includes(path) &&
            !path.startsWith('docs/'),
    );
    if (changedCode.length > 0) {
        throw new Error(
            `Build a new prerelease before promoting changed files: ${changedCode.join(', ')}`,
        );
    }

    receipt = {
        ...source,
        releaseVersion: version,
        releaseRevision: revision,
        promotedFrom: sourceTag,
    };
} else {
    throw new Error('Usage: node scripts/image-release.mjs <record|promote SOURCE_RECEIPT>');
}

console.log(JSON.stringify(receipt, null, 2));
