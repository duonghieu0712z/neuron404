import type { NeuronFrontmatter } from '#lib/neuron/schema';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';

import { listNeuronFiles, NEURONS_DIR } from './store';

export type LintIssueKind = 'dangling-synapse' | 'invalid-frontmatter' | 'isolated-neuron';

export interface LintIssue {
    fileName: string;
    kind: LintIssueKind;
    message: string;
    neuronId?: string;
}

export async function lintNeurons(): Promise<LintIssue[]> {
    const fileNames = await listNeuronFiles();
    const issues: LintIssue[] = [];
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

        validNeurons.set(result.data.id, result.data);
    }

    const validIds = new Set(validNeurons.keys());
    const hasOutgoing = new Set<string>();
    const hasIncoming = new Set<string>();

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

            hasOutgoing.add(neuron.id);
            hasIncoming.add(synapse.target);
        }
    }

    for (const neuron of validNeurons.values()) {
        if (!hasOutgoing.has(neuron.id) && !hasIncoming.has(neuron.id)) {
            issues.push({
                fileName: `${neuron.id}.md`,
                kind: 'isolated-neuron',
                message: `Neuron "${neuron.title}" has no outgoing or incoming synapses`,
                neuronId: neuron.id,
            });
        }
    }

    return issues;
}
