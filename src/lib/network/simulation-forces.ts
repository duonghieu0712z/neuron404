import type { SimulationLayout } from './simulation-layout';
import type { NetworkNode } from './simulation-types';
import type { SimulationLinkDatum } from 'd3-force';

export function createRegionForce<Node extends NetworkNode>(
    nodes: Node[],
    layout: SimulationLayout<Node>,
) {
    const { anchors, targets, regionNodes, regionSlots } = layout;

    return (alpha: number) => {
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
                            x: sum.x + ((anchor.x ?? 0) + (offset?.x ?? 0)) / memberships.length,
                            y: sum.y + ((anchor.y ?? 0) + (offset?.y ?? 0)) / memberships.length,
                        };
                    },
                    { x: 0, y: 0 },
                );
                node.vx = (node.vx ?? 0) + (target.x - (node.x ?? 0)) * 0.24 * alpha;
                node.vy = (node.vy ?? 0) + (target.y - (node.y ?? 0)) * 0.24 * alpha;
            }
        }

        for (const [id, center] of regionNodes) {
            const members = nodes.filter((node) => regionSlots.get(id)?.has(node.id));

            if (!members.length) {
                continue;
            }

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
    };
}

export function createOverviewClearanceForce<Node extends NetworkNode>(
    links: SimulationLinkDatum<Node>[],
    layout: SimulationLayout<Node>,
) {
    const { regionNodes } = layout;

    return (alpha: number) => {
        for (const center of regionNodes.values()) {
            for (const link of links) {
                const source = link.source as Node;
                const target = link.target as Node;

                if (source === center || target === center) {
                    continue;
                }

                const dx = (target.x ?? 0) - (source.x ?? 0);
                const dy = (target.y ?? 0) - (source.y ?? 0);
                const lengthSquared = dx * dx + dy * dy;

                if (lengthSquared < 1) {
                    continue;
                }

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

                if (distance >= clearance) {
                    continue;
                }

                const length = Math.sqrt(lengthSquared);
                const normalX = distance > 0.01 ? offsetX / distance : -dy / length;
                const normalY = distance > 0.01 ? offsetY / distance : dx / length;
                const sourceWeight = source.fx == null ? 1 - projection : 0;
                const targetWeight = target.fx == null ? projection : 0;
                const weight = sourceWeight ** 2 + targetWeight ** 2;

                if (!weight) {
                    continue;
                }

                const push = ((clearance - distance) * alpha * 1.2) / weight;
                source.vx = (source.vx ?? 0) + normalX * push * sourceWeight;
                source.vy = (source.vy ?? 0) + normalY * push * sourceWeight;
                target.vx = (target.vx ?? 0) + normalX * push * targetWeight;
                target.vy = (target.vy ?? 0) + normalY * push * targetWeight;
            }
        }
    };
}

export function createRegionSeparationForce<Node extends NetworkNode>(
    layout: SimulationLayout<Node>,
) {
    const { regionIds, membersByRegion, anchors, targets, regionNodes, regionSlots } = layout;

    return (alpha: number) => {
        for (let i = 0; i < regionIds.length; i++) {
            const aId = regionIds[i];
            const aMembers = membersByRegion.get(aId)!;
            const a = regionNodes.get(aId) ?? anchors.get(aId)!;

            for (let j = i + 1; j < regionIds.length; j++) {
                const bId = regionIds[j];
                const bMembers = membersByRegion.get(bId)!;

                if (aMembers.some((node) => regionSlots.get(bId)?.has(node.id))) {
                    continue;
                }

                const b = regionNodes.get(bId) ?? anchors.get(bId)!;

                const extent = (center: { x?: number; y?: number }, members: Node[]) =>
                    Math.max(
                        0,
                        ...members.map((node) =>
                            Math.hypot(
                                (node.x ?? 0) - (center.x ?? 0),
                                (node.y ?? 0) - (center.y ?? 0),
                            ),
                        ),
                    );

                const dx = (b.x ?? 0) - (a.x ?? 0);
                const dy = (b.y ?? 0) - (a.y ?? 0);
                const distance = Math.hypot(dx, dy);
                const minimum = extent(a, aMembers) + extent(b, bMembers) + 300;

                if (distance >= minimum) {
                    continue;
                }

                const nx = distance > 0.01 ? dx / distance : 1;
                const ny = distance > 0.01 ? dy / distance : 0;
                const shift = (minimum - distance) * 0.3 * alpha;

                for (const [id, members, direction] of [
                    [aId, aMembers, -1],
                    [bId, bMembers, 1],
                ] as const) {
                    const center = regionNodes.get(id);

                    if (center?.fx != null || center?.fy != null) {
                        continue;
                    }

                    const target = center ? targets.get(center.id)! : anchors.get(id)!;
                    target.x += nx * shift * direction;
                    target.y += ny * shift * direction;

                    for (const node of center ? [center, ...members] : members) {
                        node.vx = (node.vx ?? 0) + nx * shift * direction;
                        node.vy = (node.vy ?? 0) + ny * shift * direction;
                    }
                }
            }
        }
    };
}
