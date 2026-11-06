import type { Region } from '#lib/neuron/schema';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { regionCatalogSchema, regionSchema } from '#lib/neuron/schema';

import { atomicWrite, CONTENT_DIR, fingerprint, withStorageLock } from './storage';

const catalogPath = path.join(CONTENT_DIR, 'regions.json');

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
