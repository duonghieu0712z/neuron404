import './env';

import process from 'node:process';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { classifiedNeuronInputSchema, updateNeuronInputSchema } from '#lib/neuron/schema';
import { createDb } from '#lib/server/db/client';
import { createNeuron, updateNeuron } from '#lib/server/neuron/create';
import { rebuildIndex, synchronizeIndex } from '#lib/server/neuron/indexer';
import { lintNeurons } from '#lib/server/neuron/lint';
import { migrateRegionStorage } from '#lib/server/neuron/migrate-regions';
import { readCatalog, readNeuronContext, readNeuronHistory } from '#lib/server/neuron/read';
import { readRegionOverview, writeRegionOverview } from '#lib/server/neuron/region-overview';
import { addRegion } from '#lib/server/neuron/regions';
import { searchNeurons } from '#lib/server/neuron/search';
import { readSource, saveSource } from '#lib/server/neuron/sources';

async function readPayload() {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const [command, ...args] = process.argv.slice(2);
function option(name: string) {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--'))
        throw new Error(`Missing value for ${name}`);
    return args[index + 1];
}

try {
    let result: unknown;
    if (command === 'read') result = await readNeuronContext(args);
    else if (command === 'history') result = await readNeuronHistory(args[0], args[1]);
    else if (command === 'catalog') result = await readCatalog();
    else if (command === 'region:add') result = await addRegion(await readPayload());
    else if (command === 'region:read') result = await readRegionOverview(args[0]);
    else if (command === 'region:write')
        result = await writeRegionOverview(args[0], await readPayload());
    else if (command === 'source:add') {
        const saved = await saveSource(await readPayload());
        result = {
            id: saved.id,
            capturedAt: saved.capturedAt,
            title: saved.source.title,
            uri: saved.source.uri,
            locator: saved.source.locator,
        };
    } else if (command === 'source:read') result = await readSource(args[0]);
    else if (command === 'lint') {
        result = await lintNeurons();
        if ((result as unknown[]).length) process.exitCode = 1;
    } else if (['add', 'update', 'search', 'index', 'migrate'].includes(command)) {
        const db = createDb();
        if (command === 'migrate') {
            try {
                await migrate(db, { migrationsFolder: './drizzle' });
                result = { ...(await migrateRegionStorage()), ...(await synchronizeIndex(db)) };
            } finally {
                db.$client.close();
            }
        } else if (command === 'add' || command === 'update') {
            const saved =
                command === 'add'
                    ? await createNeuron(db, classifiedNeuronInputSchema.parse(await readPayload()))
                    : await updateNeuron(
                          db,
                          args[0],
                          updateNeuronInputSchema.parse(await readPayload()),
                      );
            result = {
                id: saved.id,
                title: saved.title,
                revision: saved.revision,
                lifecycle: saved.lifecycle,
                regions: saved.regions,
            };
        } else if (command === 'index')
            result = args.includes('--rebuild')
                ? await rebuildIndex(db)
                : await synchronizeIndex(db);
        else {
            const limit = Number(option('--limit') ?? 10);
            if (!Number.isInteger(limit) || limit < 1 || limit > 50)
                throw new Error('Limit must be an integer from 1 to 50');
            await synchronizeIndex(db);
            result = await searchNeurons(db, args[0] ?? '', limit, {
                region: option('--region'),
                includeHistory: args.includes('--include-history'),
            });
        }
    } else {
        throw new Error(
            'Usage: neuron <add|update ID|search QUERY [--region ID] [--limit N] [--include-history]|read ID...|history ID [REVISION]|catalog|region:add|region:read ID|region:write ID|source:add|source:read ID|index [--rebuild]|migrate|lint>',
        );
    }
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    );
    process.exitCode = 1;
}
