import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

export interface NetworkNode extends SimulationNodeDatum {
    id: string;
    regions?: string[];
    regionId?: string;
}

function orderRegionMembers<Node extends NetworkNode>(
    members: Node[],
    links: SimulationLinkDatum<Node>[],
) {
    const neighbors = new Map(members.map((node) => [node.id, new Set<string>()]));
    const edges: [string, string][] = [];
    for (const link of links) {
        const source = typeof link.source === 'object' ? link.source.id : String(link.source);
        const target = typeof link.target === 'object' ? link.target.id : String(link.target);
        if (source === target || !neighbors.has(source) || !neighbors.has(target)) continue;
        if (!neighbors.get(source)!.has(target)) edges.push([source, target]);
        neighbors.get(source)!.add(target);
        neighbors.get(target)!.add(source);
    }
    const byDegree = (a: string, b: string) =>
        neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b);
    const visited = new Set<string>();
    const order: string[] = [];
    for (const start of [...neighbors.keys()].sort(byDegree)) {
        const pending = [start];
        while (pending.length) {
            const id = pending.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            order.push(id);
            pending.push(...[...neighbors.get(id)!].sort(byDegree).reverse());
        }
    }
    const score = () => {
        const positions = new Map(order.map((id, index) => [id, index]));
        const spans = edges.map(([source, target]) => {
            const a = positions.get(source)!;
            const b = positions.get(target)!;
            return [Math.min(a, b), Math.max(a, b)];
        });
        let crossings = 0;
        let length = 0;
        for (let i = 0; i < spans.length; i++) {
            const [a, b] = spans[i];
            length += 2 - 2 * Math.cos(((b - a) * Math.PI * 2) / order.length);
            for (let j = i + 1; j < spans.length; j++) {
                const [c, d] = spans[j];
                if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) crossings++;
            }
        }
        return crossings * (edges.length * 4 + 1) + length;
    };
    let best = score();
    let budget = 2000;
    for (let pass = 0; pass < 4 && budget > 0; pass++) {
        let improved = false;
        for (let i = 0; i < order.length && budget > 0; i++) {
            for (let j = i + 1; j < order.length && budget > 0; j++) {
                budget--;
                [order[i], order[j]] = [order[j], order[i]];
                const next = score();
                if (next < best - 0.000001) {
                    best = next;
                    improved = true;
                } else {
                    [order[i], order[j]] = [order[j], order[i]];
                }
            }
        }
        if (!improved) break;
    }
    const byId = new Map(members.map((node) => [node.id, node]));
    return order.map((id) => byId.get(id)!);
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
        nodes.map((node) => {
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
            if (!settle && node.regionId) {
                target.x = node.x ?? target.x;
                target.y = node.y ?? target.y;
            }
            return [node.id, target];
        }),
    );
    const regionNodes = new Map(
        nodes.filter((node) => node.regionId).map((node) => [node.regionId!, node]),
    );
    const regionSlots = new Map(
        regionIds.map((id) => {
            const members = orderRegionMembers(
                nodes.filter(
                    (node) =>
                        !node.regionId &&
                        (node.regions?.length ? node.regions : ['region:unfiled']).includes(id),
                ),
                links,
            );
            const orbit = Math.max(120, Math.sqrt(members.length) * 42);
            return [
                id,
                new Map(
                    members.map((node, index) => {
                        const angle = (index * Math.PI * 2) / members.length - Math.PI / 2;
                        return [
                            node.id,
                            { x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit },
                        ];
                    }),
                ),
            ];
        }),
    );
    if (settle) {
        for (const node of nodes) {
            const memberships = node.regions?.length ? node.regions : ['region:unfiled'];
            const target = targets.get(node.id)!;
            const offset = memberships.reduce(
                (sum, id) => {
                    const slot = node.regionId ? undefined : regionSlots.get(id)?.get(node.id);
                    return {
                        x: sum.x + (slot?.x ?? 0) / memberships.length,
                        y: sum.y + (slot?.y ?? 0) / memberships.length,
                    };
                },
                { x: 0, y: 0 },
            );
            node.x = target.x + offset.x;
            node.y = target.y + offset.y;
        }
    }
    const simulation = forceSimulation(nodes)
        .force(
            'link',
            forceLink<Node, SimulationLinkDatum<Node>>(links)
                .id((node) => node.id)
                .distance(120)
                .strength(0.6),
        )
        .force('charge', forceManyBody().strength(-280))
        .force(
            'collide',
            forceCollide<Node>((node) => (node.regionId ? 52 : 36)),
        )
        .force('region', (alpha) => {
            for (const node of nodes) {
                let target = targets.get(node.id)!;
                if (node.regionId) {
                    if (node.fx != null && node.fy != null) {
                        target.x = node.fx;
                        target.y = node.fy;
                    }
                    node.vx = (target.x - (node.x ?? 0)) * 0.18 * alpha;
                    node.vy = (target.y - (node.y ?? 0)) * 0.18 * alpha;
                } else {
                    const memberships = node.regions?.length ? node.regions : ['region:unfiled'];
                    target = memberships.reduce(
                        (sum, id) => {
                            const anchor = regionNodes.get(id) ?? anchors.get(id)!;
                            const offset = regionNodes.has(id)
                                ? regionSlots.get(id)?.get(node.id)
                                : undefined;
                            return {
                                x:
                                    sum.x +
                                    ((anchor.x ?? 0) + (offset?.x ?? 0)) / memberships.length,
                                y:
                                    sum.y +
                                    ((anchor.y ?? 0) + (offset?.y ?? 0)) / memberships.length,
                            };
                        },
                        { x: 0, y: 0 },
                    );
                    node.vx = (node.vx ?? 0) + (target.x - (node.x ?? 0)) * 0.12 * alpha;
                    node.vy = (node.vy ?? 0) + (target.y - (node.y ?? 0)) * 0.12 * alpha;
                }
            }
            for (const [id, center] of regionNodes) {
                const members = nodes.filter((node) => regionSlots.get(id)?.has(node.id));
                if (!members.length) continue;
                const centroid = members.reduce(
                    (sum, node) => ({
                        x: sum.x + (node.x ?? 0) / members.length,
                        y: sum.y + (node.y ?? 0) / members.length,
                    }),
                    { x: 0, y: 0 },
                );
                for (const member of members) {
                    const strength = (0.5 * alpha) / (member.regions?.length || 1);
                    member.vx = (member.vx ?? 0) + ((center.x ?? 0) - centroid.x) * strength;
                    member.vy = (member.vy ?? 0) + ((center.y ?? 0) - centroid.y) * strength;
                }
            }
        })
        .force('overview-clearance', (alpha) => {
            for (const center of regionNodes.values()) {
                for (const link of links) {
                    const source = link.source as Node;
                    const target = link.target as Node;
                    if (source === center || target === center) continue;
                    const dx = (target.x ?? 0) - (source.x ?? 0);
                    const dy = (target.y ?? 0) - (source.y ?? 0);
                    const lengthSquared = dx * dx + dy * dy;
                    if (lengthSquared < 1) continue;
                    const projection = Math.max(
                        0,
                        Math.min(
                            1,
                            (((center.x ?? 0) - (source.x ?? 0)) * dx +
                                ((center.y ?? 0) - (source.y ?? 0)) * dy) /
                                lengthSquared,
                        ),
                    );
                    const offsetX = (source.x ?? 0) + dx * projection - (center.x ?? 0);
                    const offsetY = (source.y ?? 0) + dy * projection - (center.y ?? 0);
                    const distance = Math.hypot(offsetX, offsetY);
                    const clearance = 80;
                    if (distance >= clearance) continue;
                    const length = Math.sqrt(lengthSquared);
                    const normalX = distance > 0.01 ? offsetX / distance : -dy / length;
                    const normalY = distance > 0.01 ? offsetY / distance : dx / length;
                    const sourceWeight = source.fx == null ? 1 - projection : 0;
                    const targetWeight = target.fx == null ? projection : 0;
                    const weight = sourceWeight ** 2 + targetWeight ** 2;
                    if (!weight) continue;
                    const push = ((clearance - distance) * alpha * 1.2) / weight;
                    source.vx = (source.vx ?? 0) + normalX * push * sourceWeight;
                    source.vy = (source.vy ?? 0) + normalY * push * sourceWeight;
                    target.vx = (target.vx ?? 0) + normalX * push * targetWeight;
                    target.vy = (target.vy ?? 0) + normalY * push * targetWeight;
                }
            }
        })
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
