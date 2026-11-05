import type { Db } from '#lib/server/db/client';

import { rm } from 'node:fs/promises';
import path from 'node:path';

import { eq, sql } from 'drizzle-orm';

import { neurons, synapses } from '#lib/server/db/schema';

import { readSource } from './sources';
import { CONTENT_DIR, withStorageLock } from './storage';
import { listNeuronFiles, readNeuronSnapshot } from './store';
import { readTopics } from './topics';

export async function synchronizeIndexUnlocked(db: Db, force = false) {
    const snapshots = await Promise.all(
        (await listNeuronFiles()).map((file) => readNeuronSnapshot(file.slice(0, -3))),
    );
    const topicIds = new Set((await readTopics()).map((topic) => topic.id));
    const byId = new Map(snapshots.map(({ neuron }) => [neuron.id, neuron]));
    const sourceIds = new Set<string>();
    for (const { neuron } of snapshots) {
        for (const id of neuron.topics)
            if (!topicIds.has(id)) throw new Error(`Unknown region "${id}" on neuron ${neuron.id}`);
        for (const edge of neuron.synapses)
            if (!byId.has(edge.target)) throw new Error(`Unknown synapse target: ${edge.target}`);
        for (const id of neuron.sources) sourceIds.add(id);
        const visited = new Set([neuron.id]);
        let replacement = neuron.supersededBy;
        if (neuron.lifecycle === 'superseded' && !replacement)
            throw new Error(`Superseded neuron needs a replacement: ${neuron.id}`);
        if (neuron.lifecycle !== 'superseded' && replacement)
            throw new Error(`Only superseded neurons may name a replacement: ${neuron.id}`);
        while (replacement) {
            if (visited.has(replacement)) throw new Error('Supersession cycle');
            visited.add(replacement);
            const target = byId.get(replacement);
            if (!target) throw new Error(`Unknown replacement: ${replacement}`);
            replacement = target.supersededBy;
        }
    }
    await Promise.all([...sourceIds].map(readSource));
    const existing = await db.select({ id: neurons.id, revision: neurons.revision }).from(neurons);
    const previous = new Map(existing.map((row) => [row.id, row.revision]));
    const fts = await db.run(sql`PRAGMA table_info(neurons_fts)`);
    const recreateFts = !fts.rows.some((row) => row.name === 'aliases');
    const changed = snapshots.filter(
        ({ neuron, revision }) => force || recreateFts || previous.get(neuron.id) !== revision,
    );
    const removed = existing.filter((row) => !byId.has(row.id));

    if (!changed.length && !removed.length && !recreateFts) {
        await rm(path.join(CONTENT_DIR, '.index-dirty'), { force: true });
        return {
            neuronCount: snapshots.length,
            synapseCount: snapshots.reduce((n, { neuron }) => n + neuron.synapses.length, 0),
            updated: 0,
            removed: 0,
        };
    }

    await db.transaction(async (tx) => {
        if (recreateFts) await tx.run(sql`DROP TABLE IF EXISTS neurons_fts`);
        await tx.run(
            sql`CREATE VIRTUAL TABLE IF NOT EXISTS neurons_fts USING fts5(id UNINDEXED, title, body, aliases, tokenize='unicode61 remove_diacritics 2')`,
        );
        for (const row of removed) {
            await tx.delete(synapses).where(eq(synapses.sourceNeuronId, row.id));
            await tx.delete(synapses).where(eq(synapses.targetNeuronId, row.id));
            await tx.run(sql`DELETE FROM neurons_fts WHERE id = ${row.id}`);
            await tx.delete(neurons).where(eq(neurons.id, row.id));
        }
        for (const { neuron, revision } of changed) {
            const values = {
                id: neuron.id,
                title: neuron.title,
                status: neuron.status,
                grounding: neuron.grounding,
                endorsement: neuron.endorsement,
                provenance: neuron.provenance,
                body: neuron.body,
                filePath: `${neuron.id}.md`,
                createdAt: neuron.created,
                updatedAt: neuron.updated,
                aliases: neuron.aliases,
                topics: neuron.topics,
                sources: neuron.sources,
                lifecycle: neuron.lifecycle,
                supersededBy: neuron.supersededBy ?? null,
                revision,
            };
            await tx
                .insert(neurons)
                .values(values)
                .onConflictDoUpdate({ target: neurons.id, set: values });
            await tx.run(sql`DELETE FROM neurons_fts WHERE id = ${neuron.id}`);
            await tx.run(
                sql`INSERT INTO neurons_fts (id, title, body, aliases) VALUES (${neuron.id}, ${neuron.title}, ${neuron.body}, ${neuron.aliases.join(' ')})`,
            );
            await tx.delete(synapses).where(eq(synapses.sourceNeuronId, neuron.id));
        }
        for (const { neuron } of changed)
            for (const edge of neuron.synapses)
                await tx.insert(synapses).values({
                    sourceNeuronId: neuron.id,
                    targetNeuronId: edge.target,
                    kind: edge.kind,
                    note: edge.note,
                });
    });
    await rm(path.join(CONTENT_DIR, '.index-dirty'), { force: true });
    return {
        neuronCount: snapshots.length,
        synapseCount: snapshots.reduce((n, { neuron }) => n + neuron.synapses.length, 0),
        updated: changed.length,
        removed: removed.length,
    };
}

export async function rebuildIndex(db: Db) {
    return withStorageLock(() => synchronizeIndexUnlocked(db, true));
}

export async function synchronizeIndex(db: Db) {
    return withStorageLock(() => synchronizeIndexUnlocked(db));
}
