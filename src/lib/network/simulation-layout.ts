import type { NetworkNode } from './simulation-types';
import type { SimulationLinkDatum } from 'd3-force';

import { orderRegionMembers } from './member-order';

export function createSimulationLayout<Node extends NetworkNode>(
    nodes: Node[],
    links: SimulationLinkDatum<Node>[],
    settle: boolean,
) {
    const regionIds = [
        ...new Set(
            nodes.flatMap((node) => (node.regions?.length ? node.regions : ['region:unfiled'])),
        ),
    ].sort();

    const membersByRegion = new Map(
        regionIds.map((id) => [
            id,
            nodes.filter(
                (node) =>
                    !node.regionId &&
                    (node.regions?.length ? node.regions : ['region:unfiled']).includes(id),
            ),
        ]),
    );

    const orbitByRegion = new Map(
        regionIds.map((id) => [id, Math.max(120, Math.sqrt(membersByRegion.get(id)!.length) * 42)]),
    );

    const spacing = Math.max(...orbitByRegion.values()) * 2 + 340;
    const radius = regionIds.length > 1 ? spacing / (2 * Math.sin(Math.PI / regionIds.length)) : 0;

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
            const members = orderRegionMembers(membersByRegion.get(id)!, links);
            const orbit = orbitByRegion.get(id)!;

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

    return { regionIds, membersByRegion, anchors, targets, regionNodes, regionSlots };
}

export type SimulationLayout<Node extends NetworkNode> = ReturnType<
    typeof createSimulationLayout<Node>
>;
