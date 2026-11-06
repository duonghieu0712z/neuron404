import type { NeuronFrontmatter } from '#lib/neuron/schema';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { readRegions } from './regions';
import { readSource } from './sources';
import { listNeuronFiles, NEURONS_DIR } from './store';

export type LintIssueKind =
    | 'dangling-synapse'
    | 'invalid-frontmatter'
    | 'invalid-lifecycle'
    | 'invalid-source'
    | 'unknown-region'
    | 'invalid-regions';

export interface LintIssue {
    fileName: string;
    kind: LintIssueKind;
    message: string;
    neuronId?: string;
}

export async function lintNeurons(): Promise<LintIssue[]> {
    const fileNames = await listNeuronFiles();
    const issues: LintIssue[] = [];
    let regionIds: Set<string>;
    try {
        regionIds = new Set((await readRegions()).map((region) => region.id));
    } catch (error) {
        return [{ fileName: 'regions.json', kind: 'invalid-regions', message: String(error) }];
    }
    const validNeurons = new Map<string, NeuronFrontmatter>();

    for (const fileName of fileNames) {
        const raw = await readFile(path.join(NEURONS_DIR, fileName), 'utf-8');
        const parsed = matter(raw);
        const result = neuronFrontmatterSchema.safeParse(parsed.data);

        if (!result.success) {
            issues.push({
                fileName,
                kind: 'invalid-frontmatter',
                message: result.error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; '),
            });
            continue;
        }

        if (`${result.data.id}.md` !== fileName) {
            issues.push({
                fileName,
                kind: 'invalid-frontmatter',
                message: 'Neuron ID does not match filename',
            });
            continue;
        }
        validNeurons.set(result.data.id, result.data);
        for (const id of result.data.regions) {
            if (!regionIds.has(id))
                issues.push({
                    fileName,
                    kind: 'unknown-region',
                    message: `Unknown region "${id}"`,
                    neuronId: result.data.id,
                });
        }
    }

    const validIds = new Set(validNeurons.keys());

    for (const neuron of validNeurons.values()) {
        for (const synapse of neuron.synapses) {
            if (!validIds.has(synapse.target)) {
                issues.push({
                    fileName: `${neuron.id}.md`,
                    kind: 'dangling-synapse',
                    message: `Synapse (${synapse.kind}) targets unknown neuron id "${synapse.target}"`,
                    neuronId: neuron.id,
                });
                continue;
            }
        }
    }

    for (const neuron of validNeurons.values()) {
        let message = '';
        if ((neuron.lifecycle === 'superseded') !== Boolean(neuron.supersededBy))
            message = 'Invalid replacement state';
        const visited = new Set([neuron.id]);
        let replacement = neuron.supersededBy;
        while (replacement) {
            if (visited.has(replacement)) {
                message = 'Supersession cycle';
                break;
            }
            visited.add(replacement);
            const target = validNeurons.get(replacement);
            if (!target) {
                message = `Unknown replacement: ${replacement}`;
                break;
            }
            replacement = target.supersededBy;
        }
        if (message)
            issues.push({
                fileName: `${neuron.id}.md`,
                kind: 'invalid-lifecycle',
                message,
                neuronId: neuron.id,
            });
        for (const id of neuron.sources) {
            try {
                await readSource(id);
            } catch (error) {
                issues.push({
                    fileName: `${neuron.id}.md`,
                    kind: 'invalid-source',
                    message: String(error),
                    neuronId: neuron.id,
                });
            }
        }
    }

    return issues;
}
