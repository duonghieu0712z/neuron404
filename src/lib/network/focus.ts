import type { NetworkData } from './types';

import { getRegionNodeId } from './region-node';

export function resolveNetworkFocus(
    data: NetworkData,
    id: string,
    preferredRegionId: string | null = null,
) {
    const regionNode = data.regions.find((region) => getRegionNodeId(region.id) === id);
    const neuron = data.nodes.find((node) => node.id === id);

    if (!regionNode && !neuron) {
        return null;
    }

    const memberships = data.regions.filter((region) => neuron?.regions.includes(region.id));
    const region =
        regionNode ??
        memberships.find((region) => region.id === preferredRegionId) ??
        (memberships.length === 1 ? memberships[0] : undefined);

    if (region) {
        return {
            regionId: region.id,
            nodeIds: [...new Set([id, getRegionNodeId(region.id), ...region.nodeIds])],
        };
    }

    return {
        regionId: null,
        nodeIds: [
            ...new Set([
                id,
                ...data.edges.flatMap((edge) => {
                    if (edge.source === id) {
                        return [edge.target];
                    }
                    if (edge.target === id) {
                        return [edge.source];
                    }
                    return [];
                }),
            ]),
        ],
    };
}
