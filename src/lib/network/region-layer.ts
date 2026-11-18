import type { MembershipLink, MembershipSegment } from './membership-hover';
import type { RenderState } from './render-state';
import type { NetworkData, NetworkTheme } from './types';
import type Sigma from 'sigma';

import { REGION_COLOR } from './appearance';
import { getVisibleMembershipLinks } from './membership';
import { createMembershipHover } from './membership-hover';
import { getRegionNodeId } from './region-node';
import { getRegionHull } from './regions';
import { createShapeProgram, shapeColor, ShapeMesh, type Point } from './webgl-shapes';

export function createRegionLayer(
    sigmaInstance: Sigma,
    data: NetworkData,
    state: RenderState,
    theme: NetworkTheme,
    onHover: (link: MembershipLink | null) => void,
) {
    const network = sigmaInstance.getGraph();
    const isDark = theme === 'dark';
    const foreground = isDark ? '#e5e7eb' : '#272d38';
    const hover = createMembershipHover(sigmaInstance, onHover, () => state.activeEdge !== null);

    let segments: MembershipSegment[] = [];
    let cachedMesh: ShapeMesh | null = null;
    let cachedKey = '';

    const buildMesh = () => {
        const key = JSON.stringify([
            sigmaInstance.getDimensions(),
            sigmaInstance.getCamera().getState(),
            state.activeNode,
            state.selectedNode,
            state.activeEdge,
            state.activeMembership,
            state.visibleMembershipMode,
            state.searchMatches ? [...state.searchMatches].sort() : null,
            network.mapNodes((id, node) => [
                id,
                node.x,
                node.y,
                node.size,
                sigmaInstance.getNodeState(id).isHidden,
            ]),
        ]);
        if (cachedMesh && key === cachedKey) {
            return cachedMesh;
        }
        const mesh = new ShapeMesh();

        for (const region of data.regions) {
            const members = [...region.nodeIds, getRegionNodeId(region.id)].filter(
                (id) => !sigmaInstance.getNodeState(id).isHidden,
            );

            if (!members.length) {
                continue;
            }

            const points = members.map((id) =>
                sigmaInstance.graphToViewport({
                    x: network.getNodeAttribute(id, 'x'),
                    y: network.getNodeAttribute(id, 'y'),
                }),
            );

            const padding = Math.max(
                38,
                ...members.map(
                    (id) => sigmaInstance.scaleSize(network.getNodeAttribute(id, 'size')) + 26,
                ),
            );

            const hull = getRegionHull(points, padding);

            if (!hull.length) {
                continue;
            }

            const highlighted = state.activeNode !== null && members.includes(state.activeNode);

            const searchOpacity =
                state.matchesSearch(getRegionNodeId(region.id)) || highlighted ? 1 : 0.25;
            const outline: Point[] = [];
            const last = hull[hull.length - 1];
            let previous = { x: (hull[0].x + last.x) / 2, y: (hull[0].y + last.y) / 2 };
            outline.push(previous);

            for (let index = 0; index < hull.length; index++) {
                const control = hull[index];
                const next = hull[(index + 1) % hull.length];
                const end = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 };
                const deviation =
                    Math.hypot(
                        previous.x - 2 * control.x + end.x,
                        previous.y - 2 * control.y + end.y,
                    ) / 4;
                const steps = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(deviation / 0.35))));

                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    outline.push({
                        x: (1 - t) ** 2 * previous.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
                        y: (1 - t) ** 2 * previous.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
                    });
                }
                previous = end;
            }

            mesh.fill(
                outline,
                shapeColor(
                    isDark ? '#a1a1aa' : '#71717a',
                    (highlighted ? 0.08 : 0.035) * searchOpacity,
                ),
            );
            mesh.dashedPath(
                outline,
                highlighted ? 1.5 : 1,
                shapeColor(foreground, (highlighted ? 0.45 : 0.18) * searchOpacity),
                14,
                8,
            );
        }

        segments = [];

        for (const link of getVisibleMembershipLinks(
            data.regions,
            state.visibleMembershipMode,
            state.activeNode,
            state.selectedNode,
            state.activeMembership,
        )) {
            if (
                sigmaInstance.getNodeState(link.source).isHidden ||
                sigmaInstance.getNodeState(link.target).isHidden
            ) {
                continue;
            }

            const source = network.getNodeAttributes(link.source);
            const target = network.getNodeAttributes(link.target);
            const start = sigmaInstance.graphToViewport({ x: source.x, y: source.y });
            const end = sigmaInstance.graphToViewport({ x: target.x, y: target.y });
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.hypot(dx, dy);
            const sourceInset = sigmaInstance.scaleSize(source.size) + 4;
            const targetInset = sigmaInstance.scaleSize(target.size) + 3;

            if (distance <= sourceInset + targetInset) {
                continue;
            }

            const segment = {
                source: link.source,
                target: link.target,
                start: {
                    x: start.x + (dx * sourceInset) / distance,
                    y: start.y + (dy * sourceInset) / distance,
                },
                end: {
                    x: end.x - (dx * targetInset) / distance,
                    y: end.y - (dy * targetInset) / distance,
                },
            };
            segments.push(segment);

            const focused =
                state.activeMembership?.source === link.source &&
                state.activeMembership.target === link.target;
            let opacity = 0.3;

            if (state.activeMembership || state.activeEdge) {
                opacity = focused ? 0.95 : 0.12;
            } else if (link.emphasized) {
                opacity = 0.6;
            } else if (state.activeNode || state.selectedNode) {
                opacity = 0.16;
            }

            opacity *=
                link.emphasized ||
                (state.matchesSearch(link.source) && state.matchesSearch(link.target))
                    ? 1
                    : 0.2;
            mesh.dashedPath(
                [segment.start, segment.end],
                focused ? 2.5 : 1,
                shapeColor(REGION_COLOR[theme], opacity),
                4,
                5,
            );
        }

        cachedKey = key;
        cachedMesh = mesh;
        return mesh;
    };

    const updateHover = () => hover.updateSegments(segments);
    sigmaInstance.on('afterRender', updateHover);

    sigmaInstance.addCustomLayerProgram('regions', 'edges', (gl) => {
        const program = createShapeProgram(gl);
        return {
            render({ width, height }) {
                program.draw(buildMesh(), width, height);
            },
            kill: program.kill,
        };
    });

    return () => {
        hover.dispose();
        sigmaInstance.off('afterRender', updateHover);
        sigmaInstance.removeCustomLayerProgram('regions');
    };
}
