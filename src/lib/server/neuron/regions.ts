import type { Region } from '#lib/neuron/schema';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { regionCatalogSchema, regionSchema } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from './storage';

const catalogPath = path.join(CONTENT_DIR, 'regions.json');

const updateRegionSchema = z.object({
    expected: regionSchema,
    title: z.string().trim().min(1),
    description: z.string(),
});

export async function updateRegion(id: string, input: unknown) {
    const { expected, title, description } = updateRegionSchema.parse(input);

    return withStorageLock(async () => {
        const raw = await readFile(catalogPath, 'utf8');
        const document = JSON.parse(raw);
        const { regions } = regionCatalogSchema.parse(document);
        const existing = regions.find((region) => region.id === id);

        if (!existing) {
            throw new Error(`Unknown region: ${id}`);
        }
        if (
            expected.id !== id ||
            expected.title !== existing.title ||
            expected.description !== existing.description
        ) {
            throw new Error('Region metadata changed. Read catalog and retry.');
        }
        if (
            regions.some(
                (region) =>
                    region.id !== id && region.title.trim().toLowerCase() === title.toLowerCase(),
            )
        ) {
            throw new Error('Region title already exists. Reuse that Region.');
        }

        const updated = { ...existing, title, description };
        await atomicWrite(
            path.join(CONTENT_DIR, 'history', 'regions', `${fingerprint(raw)}.json`),
            raw,
            true,
        );
        await atomicWrite(
            catalogPath,
            `${JSON.stringify(
                {
                    ...document,
                    regions: document.regions.map((region: Region) =>
                        region.id === id ? { ...region, title, description } : region,
                    ),
                },
                null,
                4,
            )}\n`,
        );

        return updated;
    });
}

export async function readRegions() {
    let content: string;
    try {
        content = await readFile(catalogPath, 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    return regionCatalogSchema.parse(JSON.parse(content)).regions;
}

export async function addRegion(input: unknown) {
    const region = regionSchema.parse(input);
    return withStorageLock(async () => {
        let raw: string | undefined;
        try {
            raw = await readFile(catalogPath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
        const document: Record<string, unknown> =
            raw === undefined ? { regions: [] } : JSON.parse(raw);
        const { regions } = regionCatalogSchema.parse(document);
        const existing = regions.find((item) => item.id === region.id);
        if (existing) {
            if (existing.title !== region.title || existing.description !== region.description) {
                throw new Error(
                    `Region ${region.id} already exists with different metadata. Read catalog.`,
                );
            }
            return { ...existing, created: false };
        }
        const matchingTitle = regions.find(
            (item) => item.title.trim().toLowerCase() === region.title.trim().toLowerCase(),
        );
        if (matchingTitle) {
            throw new Error(
                `Region title already exists as ${matchingTitle.id}. Reuse that Region.`,
            );
        }
        if (raw !== undefined) {
            await atomicWrite(
                path.join(CONTENT_DIR, 'history', 'regions', `${fingerprint(raw)}.json`),
                raw,
                true,
            );
        }
        const next = { ...document, regions: [...(document.regions as Region[]), region] };
        await atomicWrite(catalogPath, `${JSON.stringify(next, null, 4)}\n`);
        return { ...region, created: true };
    });
}
