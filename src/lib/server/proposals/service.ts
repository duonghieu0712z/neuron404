import type { Db } from '#lib/server/db/client';

import { randomUUID } from 'node:crypto';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import { neuronFrontmatterSchema } from '#lib/neuron/schema';
import { deriveProposalChanges } from '#lib/proposals/changes';
import { fingerprint, withStorageLock } from '#lib/server/neuron/storage';
import { readAllNeurons, readNeuronSnapshot } from '#lib/server/neuron/store';
import { commitNeuron, validateNeuronReferences } from '#lib/server/neuron/write';

import { proposalInputSchema } from './schema';
import { readProposal, saveProposal } from './storage';

async function validateProposalContent(neuron: import('#lib/neuron/schema').Neuron) {
    await validateNeuronReferences(neuron);

    const sources = new Set(neuron.sources);

    for (const match of neuron.body.matchAll(/Snapshot sha256:([a-f0-9]{64})/g)) {
        if (!sources.has(match[1])) {
            throw new Error(
                'A cited snapshot is missing from the selected sources. Accept its source change or reject the content change that cites it.',
            );
        }
    }

    const ids = new Set((await readAllNeurons()).map((item) => item.id));
    ids.add(neuron.id);

    for (const match of neuron.body.matchAll(/\]\(neuron:([a-zA-Z0-9_-]+)\)/g)) {
        if (!ids.has(match[1])) {
            throw new Error(`Unknown neuron reference: ${match[1]}`);
        }
    }
}

export async function createProposal(neuronId: string, payload: unknown) {
    const input = proposalInputSchema.parse(payload);

    return withStorageLock(async () => {
        const current = await readNeuronSnapshot(neuronId);

        if (current.revision !== input.expectedRevision) {
            throw new Error('Proposal revision conflict. Read the current neuron before retrying.');
        }

        const derived = deriveProposalChanges(current.neuron, input.changes);

        if (!derived.changes.length) {
            throw new Error('Proposal contains no changes.');
        }

        await validateProposalContent(
            derived.apply(new Set(derived.changes.map((change) => change.id))),
        );

        const proposal = {
            id: randomUUID(),
            neuronId,
            created: new Date().toISOString(),
            author: input.author,
            reason: input.reason,
            baseRevision: current.revision,
            base: current.neuron,
            patch: input.changes,
            status: 'pending' as const,
        };

        await saveProposal(proposal);

        return readProposal(proposal.id);
    });
}

const resolutionSchema = z.object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.array(z.string()).max(2000),
});

export async function resolveProposal(db: Db, id: string, payload: unknown) {
    const input = resolutionSchema.parse(payload);

    return withStorageLock(async () => {
        const stored = await readProposal(id);
        const { proposal } = stored;

        if (proposal.status === 'applied' || proposal.status === 'rejected') {
            throw new Error('Proposal was already resolved.');
        }

        if (stored.revision !== input.expectedRevision) {
            throw new Error('Proposal changed. Reload before reviewing.');
        }

        if (
            new Set(input.accepted).size !== input.accepted.length ||
            input.accepted.some((id) => !stored.changes.some((change) => change.id === id))
        ) {
            throw new Error('Invalid change selection.');
        }

        if (!input.accepted.length) {
            await saveProposal({
                ...proposal,
                status: 'rejected',
                resolution: { accepted: [], revision: null, at: new Date().toISOString() },
            });

            return readProposal(id);
        }

        const current = await readNeuronSnapshot(proposal.neuronId);

        if (current.revision !== proposal.baseRevision) {
            throw new Error(
                'Neuron changed after this proposal was created. Create a new proposal from the current revision.',
            );
        }

        const accepted = new Set(input.accepted);
        const merged = deriveProposalChanges(proposal.base, proposal.patch).apply(accepted);
        const combined = { ...merged, updated: new Date().toISOString() };
        const frontmatter = neuronFrontmatterSchema.parse(combined);
        const target = { ...frontmatter, body: merged.body };

        if (!target.title.trim() || !target.body.trim()) {
            throw new Error('Selected changes would leave an empty title or content.');
        }

        await validateProposalContent(target);

        const { body, ...metadata } = target;
        const revision = fingerprint(
            matter.stringify(`${body}\n`, neuronFrontmatterSchema.parse(metadata)),
        );
        const prepared = {
            ...proposal,
            status: 'applying' as const,
            resolution: { accepted: input.accepted, revision, at: combined.updated },
        };

        await saveProposal(prepared);

        const saved = await commitNeuron(db, target, current.raw);

        await saveProposal({
            ...prepared,
            status: 'applied',
            resolution: { ...prepared.resolution, revision: saved.revision },
        });

        return readProposal(id);
    });
}
