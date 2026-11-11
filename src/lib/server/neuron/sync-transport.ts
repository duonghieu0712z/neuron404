import { z } from 'zod';

import { requestRemote } from '../../../../skills/neuron404/scripts/transport.mjs';
import { partialReferenceSchema } from './partial-references';
import { fingerprint } from './storage';
import { normalizeSyncRegions, type SyncFile } from './sync-scope';
import { syncEntrySchema } from './sync-storage';

const manifestSchema = z.object({
    protocol: z.literal(2),
    regions: z.array(z.string()),
    entries: z.array(syncEntrySchema),
    next: z.number().int().nonnegative().nullable(),
});

const fileSchema = syncEntrySchema.extend({
    content: z.string(),
    partialReferences: partialReferenceSchema.optional(),
});

export const stateSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));

export function parseSyncOptions(args: string[]) {
    let direction: 'both' | 'push' | 'pull' = 'both';
    let dryRun = false;
    const regions: string[] = [];

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];

        if (argument === '--dry-run') {
            dryRun = true;
        } else if (argument === '--direction') {
            direction = z.enum(['both', 'push', 'pull']).parse(args[++index]);
        } else if (argument === '--region') {
            regions.push(z.string().parse(args[++index]));
        } else {
            throw new Error(`Invalid sync option: ${argument}`);
        }
    }

    return { direction, dryRun, regions: normalizeSyncRegions(regions) };
}

export type SyncOptions = ReturnType<typeof parseSyncOptions>;

export type FileAction = { path: string; action: 'push' | 'pull' | 'skip'; reason?: string };

export async function remoteManifest(regions: string[]) {
    const remote = new Map<string, string>();
    let offset: number | null = 0;
    do {
        const page = manifestSchema.parse(
            await requestRemote('sync:manifest', [String(offset), ...regions]),
        );

        if (JSON.stringify(page.regions) !== JSON.stringify(regions)) {
            throw new Error('Invalid remote sync scope. Update both client and server.');
        }

        for (const entry of page.entries) {
            remote.set(entry.path, entry.revision);
        }

        if (page.next !== null && page.next <= offset) {
            throw new Error('Invalid remote manifest pagination.');
        }

        offset = page.next;
    } while (offset !== null);
    return remote;
}

export async function remoteFile(name: string, revision: string | undefined, regions: string[]) {
    if (!revision) {
        return null;
    }

    const file = fileSchema.parse(await requestRemote('sync:read', [name, ...regions]));

    if (
        file.path !== name ||
        file.revision !== revision ||
        fingerprint(file.content) !== revision
    ) {
        throw new Error(`Sync conflict: remote changed during sync: ${name}`);
    }

    return file;
}

export function transferContent(
    push: boolean,
    pull: boolean,
    local: SyncFile | null,
    remote: SyncFile | null,
) {
    if (push) {
        return local!.content;
    }

    if (pull) {
        return remote!.content;
    }

    return (
        [
            ...new Set(
                [...local!.content.split('\n'), ...remote!.content.split('\n')].filter(Boolean),
            ),
        ]
            .sort()
            .join('\n') + '\n'
    );
}
