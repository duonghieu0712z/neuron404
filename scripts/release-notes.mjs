import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const requested = process.argv[2] ?? version;
const semver =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;

if (process.argv.length > 3 || !semver.test(requested) || requested !== version) {
    throw new Error('The release version must be valid SemVer and match package.json.');
}

const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
const sections = changelog.split(/^## /m).slice(1);
const prefix = `[${version}] - `;
const matches = sections.filter((section) => section.startsWith(prefix));
if (matches.length !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one dated section for ${version}.`);
}

const [heading, ...lines] = matches[0].split('\n');
const date = heading.slice(prefix.length).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('The release date must be a valid YYYY-MM-DD date.');
}

const body = lines
    .join('\n')
    .replace(/^\[[^\]]+\]:.*$/gm, '')
    .trim();
if (!/^[-*] \S/m.test(body)) {
    throw new Error('The release changelog must describe at least one change.');
}

const url = `https://github.com/duonghieu0712z/neuron404/blob/v${version}/CHANGELOG.md`;
console.log(`${body}\n\n[See full changelog](${url})`);
