import { migrate } from 'drizzle-orm/libsql/migrator';

import { classifiedNeuronInputSchema, updateNeuronInputSchema } from '#lib/neuron/schema';
import { createDb } from '#lib/server/db/client';
import { listReviewReports, readReport } from '#lib/server/maintenance/reports';
import { createNeuron, updateNeuron } from '#lib/server/neuron/create';
import { ensureIndex, rebuildIndex, synchronizeIndex } from '#lib/server/neuron/indexer';
import { lintNeurons } from '#lib/server/neuron/lint';
import { migrateRegionStorage } from '#lib/server/neuron/migrate-regions';
import {
    readCatalog,
    readNeighbors,
    readNeuronContext,
    readNeuronHistory,
} from '#lib/server/neuron/read';
import {
    readRegionOverview,
    readRegionSummary,
    writeRegionOverview,
} from '#lib/server/neuron/region-overview';
import { addRegion } from '#lib/server/neuron/regions';
import { searchNeurons } from '#lib/server/neuron/search';
import { readSource, saveSource } from '#lib/server/neuron/sources';
import { normalizeSyncRegions } from '#lib/server/neuron/sync-scope';
import { readSyncFile, syncManifest, writeSyncFile } from '#lib/server/neuron/sync-storage';

export const REMOTE_READ_COMMANDS = [
    'read',
    'neighbors',
    'history',
    'catalog',
    'search',
    'region:read',
    'source:read',
    'review:reports',
    'review:read',
    'sync:manifest',
    'sync:read',
] as const;
export const REMOTE_WRITE_COMMANDS = [
    'add',
    'update',
    'region:add',
    'region:write',
    'source:add',
    'sync:write',
] as const;

export async function executeNeuronCommand(command: string, args: string[], payload?: unknown) {
    function option(name: string) {
        const index = args.indexOf(name);
        if (index < 0) {
            return undefined;
        }
        if (!args[index + 1] || args[index + 1].startsWith('--')) {
            throw new Error(`Missing value for ${name}`);
        }
        return args[index + 1];
    }
    let result: unknown;
    if (command === 'sync:manifest') {
        const offset = Number(args[0] ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new Error('Invalid manifest offset.');
        }
        const regions = normalizeSyncRegions(args.slice(1));
        const entries = await syncManifest(offset, 1001, regions);
        result = {
            protocol: 2,
            regions,
            entries: entries.slice(0, 1000),
            next: entries.length > 1000 ? offset + 1000 : null,
        };
    } else if (command === 'sync:read') {
        result = await readSyncFile(args[0], normalizeSyncRegions(args.slice(1)));
    } else if (command === 'sync:write') {
        result = await writeSyncFile(payload);
    } else if (command === 'read') {
        result = await readNeuronContext(args);
    } else if (command === 'neighbors') {
        result = await readNeighbors(args[0], {
            limit: Number(option('--limit') ?? 20),
            offset: Number(option('--offset') ?? 0),
            kind: option('--kind'),
            direction: option('--direction'),
        });
    } else if (command === 'history') {
        result = await readNeuronHistory(args[0], args[1]);
    } else if (command === 'catalog') {
        result = await readCatalog({
            region: option('--region'),
            query: option('--query'),
            limit: Number(option('--limit') ?? 20),
            offset: Number(option('--offset') ?? 0),
            includeHistory: args.includes('--include-history'),
        });
    } else if (command === 'review:reports') {
        result = await listReviewReports();
    } else if (command === 'review:read') {
        result = await readReport(args[0]);
        if (!result) {
            throw new Error('Review report not found.');
        }
    } else if (command === 'region:add') {
        result = await addRegion(payload);
    } else if (command === 'region:read') {
        result = args.includes('--summary')
            ? await readRegionSummary(args[0])
            : await readRegionOverview(args[0]);
    } else if (command === 'region:write') {
        result = await writeRegionOverview(args[0], payload);
    } else if (command === 'source:add') {
        const saved = await saveSource(payload);
        result = {
            id: saved.id,
            capturedAt: saved.capturedAt,
            title: saved.source.title,
            uri: saved.source.uri,
            locator: saved.source.locator,
        };
    } else if (command === 'source:read') {
        result = await readSource(args[0]);
    } else if (command === 'lint') {
        result = await lintNeurons();
    } else if (['add', 'update', 'search', 'index', 'migrate'].includes(command)) {
        const db = createDb();
        try {
            if (command === 'migrate') {
                await migrate(db, { migrationsFolder: './drizzle' });
                result = { ...(await migrateRegionStorage()), ...(await synchronizeIndex(db)) };
            } else if (command === 'add' || command === 'update') {
                const saved =
                    command === 'add'
                        ? await createNeuron(db, classifiedNeuronInputSchema.parse(payload))
                        : await updateNeuron(db, args[0], updateNeuronInputSchema.parse(payload));
                result = {
                    id: saved.id,
                    title: saved.title,
                    revision: saved.revision,
                    lifecycle: saved.lifecycle,
                    regions: saved.regions,
                };
            } else if (command === 'index') {
                result = args.includes('--rebuild')
                    ? await rebuildIndex(db)
                    : await synchronizeIndex(db);
            } else {
                const limit = Number(option('--limit') ?? 10);
                if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
                    throw new Error('Limit must be an integer from 1 to 50');
                }
                await ensureIndex(db);
                result = await searchNeurons(db, args[0] ?? '', limit, {
                    region: option('--region'),
                    offset: Number(option('--offset') ?? 0),
                    includeHistory: args.includes('--include-history'),
                });
            }
        } finally {
            db.$client.close();
        }
    } else {
        throw new Error(
            'Usage: neuron <add|update ID|search QUERY [--region ID] [--limit N] [--offset N] [--include-history]|read ID...|neighbors ID [--kind KIND] [--direction incoming|outgoing|both] [--limit N] [--offset N]|history ID [REVISION]|catalog [--query QUERY] [--region ID] [--limit N] [--offset N]|region:add|region:read ID|region:write ID|review:reports|review:read ID|source:add|source:read ID|index [--rebuild]|migrate|lint>',
        );
    }
    return result;
}
