import type { NetworkNode } from './simulation-types';
import type { SimulationLinkDatum } from 'd3-force';

import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

import {
    createOverviewClearanceForce,
    createRegionForce,
    createRegionSeparationForce,
} from './simulation-forces';
import { createSimulationLayout } from './simulation-layout';

export type { NetworkNode } from './simulation-types';

export function createNetworkSimulation<Node extends NetworkNode>(
    nodes: Node[],
    links: SimulationLinkDatum<Node>[],
    settle = true,
) {
    const layout = createSimulationLayout(nodes, links, settle);

    const simulation = forceSimulation(nodes)
        .force(
            'link',
            forceLink<Node, SimulationLinkDatum<Node>>(links)
                .id((node) => node.id)
                .distance(120)
                .strength((link) => {
                    const source = link.source as Node;
                    const target = link.target as Node;

                    return source.regions?.some((id) => target.regions?.includes(id))
                        ? 0.35
                        : 0.025;
                }),
        )
        .force('charge', forceManyBody().strength(-280))
        .force(
            'collide',
            forceCollide<Node>((node) => (node.regionId ? 52 : 36)),
        )
        .force('region', createRegionForce(nodes, layout))
        .force('overview-clearance', createOverviewClearanceForce(links, layout))
        .force('region-separation', createRegionSeparationForce(layout))
        .velocityDecay(0.45)
        .stop();

    if (settle) {
        simulation.tick(400);
    }

    return simulation.alpha(0);
}

export function getNodeEntranceOffset(index: number, elapsed: number) {
    const progress = Math.min(1, Math.max(0, elapsed / 1800));
    const distance = 18 * (1 - progress) ** 3;
    const angle = index * 2.399;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}
