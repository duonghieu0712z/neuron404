import type { NetworkData, NetworkPositions, NetworkTheme, SimLink, SimNode } from './types';

import Network from 'graphology';

import {
    GROUNDING_COLORS,
    NODE_SIZE,
    REGION_COLOR,
    shortenLabel,
    SYNAPSE_COLORS,
} from './appearance';
import { getEdgeAppearance } from './edge-appearance';
import { getRegionNodeId } from './region-node';
import { createNetworkSimulation, getNodeEntranceOffset } from './simulation';

export function createNetworkGraph(
    data: NetworkData,
    positions: NetworkPositions,
    theme: NetworkTheme,
    motionEnabled: boolean,
) {
    const nodeIds = new Set(data.nodes.map((node) => node.id));

    const visualNodes: SimNode[] = [
        ...data.nodes,
        ...data.regions.map((region) => ({
            id: getRegionNodeId(region.id),
            title: region.title,
            grounding: 'region',
            regions: [region.id],
            regionId: region.id,
        })),
    ];

    const simNodes: SimNode[] = visualNodes.map((node) => ({
        ...node,
        x: positions[node.id]?.x ?? 0,
        y: positions[node.id]?.y ?? 0,
    }));

    const simNodeById = new Map(simNodes.map((node) => [node.id, node]));

    const simLinks: SimLink[] = data.edges
        .filter(
            (edge) =>
                edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target),
        )
        .map((edge) => ({
            kind: edge.kind,
            source: edge.source,
            sourceId: edge.source,
            target: edge.target,
            targetId: edge.target,
        }));

    const hasSavedPositions = simNodes.every((node) => positions[node.id]);

    const entranceActive =
        !hasSavedPositions &&
        motionEnabled &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const simulation = createNetworkSimulation(simNodes, simLinks, !hasSavedPositions);

    const network = new Network({ multi: true, type: 'directed' });

    const degrees: Record<string, number> = {};

    for (const link of simLinks) {
        degrees[link.sourceId] = (degrees[link.sourceId] ?? 0) + 1;
        degrees[link.targetId] = (degrees[link.targetId] ?? 0) + 1;
    }

    for (const node of simNodes) {
        const degree = degrees[node.id] ?? 0;
        const position = positions[node.id];

        const entrance = entranceActive
            ? getNodeEntranceOffset(node.index ?? 0, 0)
            : { x: 0, y: 0 };
        network.addNode(node.id, {
            color: node.regionId
                ? REGION_COLOR[theme]
                : (GROUNDING_COLORS[node.grounding] ?? GROUNDING_COLORS.assumption)[theme],
            shape: node.regionId ? 'hexagon' : 'circle',
            label: node.title,
            shortLabel: node.regionId ? node.title : shortenLabel(node.title),
            size: node.regionId ? 18 : NODE_SIZE + Math.min(12, Math.sqrt(degree) * 3),
            x: (position?.x ?? node.x ?? 0) + entrance.x,
            y: (position?.y ?? node.y ?? 0) + entrance.y,
        });
    }

    for (const link of simLinks) {
        const color = SYNAPSE_COLORS[link.kind as keyof typeof SYNAPSE_COLORS][theme];
        network.addEdge(link.sourceId, link.targetId, {
            color,
            kind: link.kind,
            ...getEdgeAppearance(color),
        });
    }

    return { network, simulation, simNodes, simNodeById, simLinks, entranceActive };
}

export type NetworkGraph = ReturnType<typeof createNetworkGraph>;
