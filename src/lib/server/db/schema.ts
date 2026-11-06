import { relations } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const neurons = sqliteTable('neurons', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    grounding: text('grounding').notNull(),
    endorsement: text('endorsement').notNull(),
    provenance: text('provenance').notNull(),
    body: text('body').notNull(),
    filePath: text('file_path').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
    regions: text('regions', { mode: 'json' }).$type<string[]>().notNull().default([]),
    sources: text('sources', { mode: 'json' }).$type<string[]>().notNull().default([]),
    lifecycle: text('lifecycle').notNull().default('active'),
    supersededBy: text('superseded_by'),
    revision: text('revision').notNull().default(''),
});

export const synapses = sqliteTable('synapses', {
    id: int('id').primaryKey({ autoIncrement: true }),
    sourceNeuronId: text('source_neuron_id')
        .notNull()
        .references(() => neurons.id, { onDelete: 'cascade' }),
    targetNeuronId: text('target_neuron_id')
        .notNull()
        .references(() => neurons.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    note: text('note'),
});

export const neuronsRelations = relations(neurons, ({ many }) => ({
    outgoing: many(synapses, { relationName: 'source' }),
    incoming: many(synapses, { relationName: 'target' }),
}));

export const synapsesRelations = relations(synapses, ({ one }) => ({
    source: one(neurons, {
        fields: [synapses.sourceNeuronId],
        references: [neurons.id],
        relationName: 'source',
    }),
    target: one(neurons, {
        fields: [synapses.targetNeuronId],
        references: [neurons.id],
        relationName: 'target',
    }),
}));
