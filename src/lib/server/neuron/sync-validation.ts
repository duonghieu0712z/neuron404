import path from 'node:path';

import matter from '@11ty/gray-matter';
import { z } from 'zod';

import {
    neuronFrontmatterSchema,
    regionCatalogSchema,
    sourceInputSchema,
} from '#lib/neuron/schema';
import { validateArtifact } from '#lib/server/maintenance/artifacts';
import { proposalSchema } from '#lib/server/proposals/schema';

import { partialReferenceSchema } from './partial-references';
import { pathSchema } from './reading-path';
import { fingerprint } from './storage';
import { syncRegionsSchema } from './sync-scope';

export const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const syncEntrySchema = z.object({ path: z.string(), revision });

export const writeSchema = z.object({
    path: z.string(),
    expectedRevision: revision.nullable(),
    content: z.string(),
    regions: syncRegionsSchema,
    partialReferences: partialReferenceSchema.optional(),
});

export function validateContent(relative: string, content: string) {
    if (relative.startsWith('maintenance/')) {
        validateArtifact(content, path.basename(relative, '.json'));
        return;
    }
    if (relative.startsWith('proposals/')) {
        const proposal = proposalSchema.parse(JSON.parse(content));
        if (relative !== `proposals/${proposal.id}.json`) {
            throw new Error('Invalid proposal sync ID.');
        }
        return;
    }
    if (relative.startsWith('reading-paths/')) {
        pathSchema.parse(JSON.parse(content));
        return;
    }
    if (relative.startsWith('history/')) {
        if (path.basename(relative).split('.')[0] !== fingerprint(content)) {
            throw new Error('Invalid history integrity in sync file.');
        }

        return;
    }

    if (relative.startsWith('neurons/')) {
        const parsed = neuronFrontmatterSchema.parse(matter(content, {}).data);

        if (relative !== `neurons/${parsed.id}.md`) {
            throw new Error('Invalid neuron ID in sync file.');
        }
    } else if (relative === 'regions.json') {
        regionCatalogSchema.parse(JSON.parse(content));
    } else if (relative.startsWith('sources/')) {
        const stored = JSON.parse(content);
        const source = sourceInputSchema.parse(stored.source);

        if (relative !== `sources/${fingerprint(JSON.stringify(source))}.json`) {
            throw new Error('Invalid source integrity in sync file.');
        }
    } else if (relative === 'operations.jsonl') {
        for (const line of content.split('\n').filter(Boolean)) {
            z.object({
                operation: z.enum(['create', 'update']),
                id: z.string(),
                revision,
                at: z.string(),
            }).parse(JSON.parse(line));
        }
    } else {
        const parsed = matter(content, {}).data;
        z.object({
            region: z.string(),
            updated: z.string(),
            members: z.record(z.string(), revision),
        }).parse(parsed);
    }
}
