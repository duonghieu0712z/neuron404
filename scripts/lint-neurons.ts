import './env';

import process from 'node:process';

import { lintNeurons } from '#lib/server/neuron/lint';

const issues = await lintNeurons();

if (issues.length === 0) {
    console.log('No issues found.');
    process.exit(0);
}

for (const issue of issues) {
    console.log(`[${issue.kind}] ${issue.fileName}: ${issue.message}`);
}

console.log(`\n${issues.length} issue(s) found.`);
process.exit(1);
