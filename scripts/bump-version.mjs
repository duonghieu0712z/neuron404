import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
const semver =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;

if (process.argv.length !== 3 || !version || !semver.test(version)) {
    throw new Error('Usage: pnpm bump VERSION (for example: 0.2.0 or 0.2.0-beta.1).');
}

const file = new URL('../package.json', import.meta.url);
const content = await readFile(file, 'utf8');
await writeFile(file, content.replace(/^(\s*"version":\s*")[^"]+("),/m, `$1${version}$2,`));
console.log(`Updated package.json to ${version}. Update CHANGELOG.md before tagging the release.`);
