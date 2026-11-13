import type { NetworkData, NetworkPositions } from './types';

import { getRegionNodeId } from './region-node';

export function prepareNetworkPositions(data: NetworkData, positions: NetworkPositions) {
    const nodes = [
        ...data.nodes,
        ...data.regions.map((region) => ({
            id: getRegionNodeId(region.id),
            regions: [region.id],
        })),
    ];
    const currentIds = new Set(nodes.map((node) => node.id));

    for (const id of Object.keys(positions)) {
        if (!currentIds.has(id)) {
            delete positions[id];
        }
    }

    const saved = Object.values(positions).filter((position) => position !== undefined);

    if (!saved.length) {
        return;
    }

    const center = {
        x: saved.reduce((sum, position) => sum + position.x, 0) / saved.length,
        y: saved.reduce((sum, position) => sum + position.y, 0) / saved.length,
    };

    for (const [index, node] of nodes.entries()) {
        if (positions[node.id]) {
            continue;
        }

        const neighborIds = data.edges.flatMap((edge) => {
            if (edge.source === node.id) {
                return [edge.target];
            }

            return edge.target === node.id ? [edge.source] : [];
        });
        const anchors = [...neighborIds, ...node.regions.map(getRegionNodeId)]
            .map((id) => positions[id])
            .filter((position) => position !== undefined);
        const anchor = anchors.length
            ? {
                  x: anchors.reduce((sum, position) => sum + position.x, 0) / anchors.length,
                  y: anchors.reduce((sum, position) => sum + position.y, 0) / anchors.length,
              }
            : center;
        const angle = index * 2.399;

        positions[node.id] = {
            x: anchor.x + Math.cos(angle) * 80,
            y: anchor.y + Math.sin(angle) * 80,
        };
    }
}
