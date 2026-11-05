import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

export interface NetworkNode extends SimulationNodeDatum {
    id: string;
    regions?: string[];
}

export function createNetworkSimulation<Node extends NetworkNode>(
    nodes: Node[],
    links: SimulationLinkDatum<Node>[],
    settle = true,
) {
    const regionIds = [
        ...new Set(
            nodes.flatMap((node) => (node.regions?.length ? node.regions : ['region:unfiled'])),
        ),
    ].sort();
    const radius = regionIds.length > 1 ? Math.max(260, Math.sqrt(nodes.length) * 65) : 0;
    const anchors = new Map(
        regionIds.map((id, index) => {
            const angle = (index * Math.PI * 2) / regionIds.length - Math.PI / 2;
            return [id, { x: 450 + Math.cos(angle) * radius, y: 310 + Math.sin(angle) * radius }];
        }),
    );
    const targets = new Map(
        nodes.map((node, index) => {
            const memberships = node.regions?.length ? node.regions : ['region:unfiled'];
            const target = memberships.reduce(
                (sum, id) => {
                    const anchor = anchors.get(id)!;
                    return {
                        x: sum.x + anchor.x / memberships.length,
                        y: sum.y + anchor.y / memberships.length,
                    };
                },
                { x: 0, y: 0 },
            );
            if (settle) {
                node.x = target.x + Math.cos(index * 2.399) * 30;
                node.y = target.y + Math.sin(index * 2.399) * 30;
            }
            return [node.id, target];
        }),
    );
    const simulation = forceSimulation(nodes)
        .force(
            'link',
            forceLink<Node, SimulationLinkDatum<Node>>(links)
                .id((node) => node.id)
                .distance(120)
                .strength(0.6),
        )
        .force('charge', forceManyBody().strength(-280))
        .force('collide', forceCollide(36))
        .force('x', forceX<Node>((node) => targets.get(node.id)!.x).strength(0.12))
        .force('y', forceY<Node>((node) => targets.get(node.id)!.y).strength(0.12))
        .velocityDecay(0.45)
        .stop();

    if (settle) simulation.tick(400);

    return simulation.alpha(0);
}

export function getNodeEntranceOffset(index: number, elapsed: number) {
    const progress = Math.min(1, Math.max(0, elapsed / 1800));
    const distance = 18 * (1 - progress) ** 3;
    const angle = index * 2.399;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}
