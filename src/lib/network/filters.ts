import type { NetworkData } from './types';

export interface NetworkFilters {
    region: string;
    grounding: string;
    endorsement: string;
}

export function filterNetworkNodes(
    data: NetworkData,
    matches: Set<string> | null,
    filters: NetworkFilters,
) {
    if (!matches && !filters.region && !filters.grounding && !filters.endorsement) {
        return null;
    }

    const nodes = new Map(data.nodes.map((node) => [node.id, node]));

    return new Set(
        [...(matches ?? nodes.keys())].filter((id) => {
            const node = nodes.get(id);

            return (
                node &&
                (!filters.region ||
                    (filters.region === 'region:unfiled'
                        ? node.regions.length === 0
                        : node.regions.includes(filters.region))) &&
                (!filters.grounding || node.grounding === filters.grounding) &&
                (!filters.endorsement || node.endorsement === filters.endorsement)
            );
        }),
    );
}
