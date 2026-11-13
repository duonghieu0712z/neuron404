import type { Proposal } from './schema';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { deriveProposalChanges } from '#lib/proposals/changes';
import { readSource } from '#lib/server/neuron/sources';
import { atomicWrite, CONTENT_DIR, fingerprint, safeId } from '#lib/server/neuron/storage';
import { readNeuronSnapshot } from '#lib/server/neuron/store';

import { proposalSchema } from './schema';

const directory = path.join(CONTENT_DIR, 'proposals');

function filePath(id: string) {
    return path.join(directory, `${z.string().uuid().parse(id)}.json`);
}

export async function saveProposal(proposal: Proposal) {
    await atomicWrite(filePath(proposal.id), JSON.stringify(proposalSchema.parse(proposal)));
}

export async function readProposal(id: string) {
    const raw = await readFile(filePath(id), 'utf8');
    const proposal = proposalSchema.parse(JSON.parse(raw));

    if (proposal.id !== id) {
        throw new Error('Proposal ID mismatch.');
    }

    const current = await readNeuronSnapshot(proposal.neuronId).catch((cause) => {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw cause;
    });

    // A prepared resolution survives a crash between the neuron write and receipt write.
    if (proposal.status === 'applying' && proposal.resolution?.revision) {
        const appliedRevision = proposal.resolution.revision;
        let applied = current?.revision === appliedRevision;

        if (!applied) {
            try {
                const archived = await readFile(
                    path.join(
                        CONTENT_DIR,
                        'history',
                        safeId(proposal.neuronId),
                        `${appliedRevision}.md`,
                    ),
                    'utf8',
                );

                applied = fingerprint(archived) === appliedRevision;
            } catch (cause) {
                if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw cause;
                }
            }
        }

        if (applied) {
            proposal.status = 'applied';
        }
    }

    const sources = Object.fromEntries(
        await Promise.all(
            [...new Set([...proposal.base.sources, ...(proposal.patch.sources ?? [])])].map(
                async (id) => {
                    try {
                        const snapshot = await readSource(id);

                        return [id, { title: snapshot.source.title, uri: snapshot.source.uri }];
                    } catch (cause) {
                        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                            throw cause;
                        }

                        return [id, { title: 'Unavailable source', uri: '' }];
                    }
                },
            ),
        ),
    );
    const neurons = Object.fromEntries(
        await Promise.all(
            [
                ...new Set(
                    [...proposal.base.synapses, ...(proposal.patch.synapses ?? [])].map(
                        (link) => link.target,
                    ),
                ),
            ].map(async (id) => {
                try {
                    return [id, (await readNeuronSnapshot(id)).neuron.title];
                } catch (cause) {
                    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw cause;
                    }

                    return [id, 'Unavailable neuron'];
                }
            }),
        ),
    );

    return {
        sources,
        neurons,
        proposal,
        revision: fingerprint(raw),
        currentRevision: current?.revision ?? null,
        stale: current?.revision !== proposal.baseRevision,
        changes: deriveProposalChanges(proposal.base, proposal.patch).changes,
    };
}

export async function listProposals() {
    let files: string[];

    try {
        files = await readdir(directory);
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }

        throw cause;
    }

    const proposals = await Promise.all(
        files
            .filter((file) => file.endsWith('.json'))
            .map((file) => readProposal(file.slice(0, -5))),
    );

    return proposals.sort((a, b) => b.proposal.created.localeCompare(a.proposal.created));
}
