import type { NetworkData } from './types';

export interface NetworkSelection {
    neuronId: string | null;
    regionId: string | null;
}

export function readNetworkSelection(url: URL): NetworkSelection {
    return {
        neuronId: url.searchParams.get('neuron') || null,
        regionId: url.searchParams.get('region') || null,
    };
}

export function networkSelectionKey(selection: NetworkSelection) {
    return JSON.stringify([selection.neuronId, selection.regionId]);
}

export function networkSelectionUrl(url: URL, selection: NetworkSelection) {
    const next = new URL(url);
    next.searchParams.delete('neuron');
    next.searchParams.delete('region');
    if (selection.neuronId) {
        next.searchParams.set('neuron', selection.neuronId);
    }
    if (selection.regionId) {
        next.searchParams.set('region', selection.regionId);
    }
    return next;
}

export function normalizeNetworkSelection(
    data: NetworkData,
    selection: NetworkSelection,
): NetworkSelection | null {
    if (selection.neuronId) {
        const neuron = data.nodes.find((node) => node.id === selection.neuronId);
        if (!neuron) {
            return null;
        }
        return {
            neuronId: neuron.id,
            regionId:
                selection.regionId && neuron.regions.includes(selection.regionId)
                    ? selection.regionId
                    : null,
        };
    }
    if (
        selection.regionId &&
        !data.regions.some(
            (region) => region.id === selection.regionId && region.id !== 'region:unfiled',
        )
    ) {
        return null;
    }
    return { neuronId: null, regionId: selection.regionId };
}
