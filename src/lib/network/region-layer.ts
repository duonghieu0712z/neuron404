import type { RenderState } from './render-state';
import type { NetworkData, NetworkTheme } from './types';
import type Sigma from 'sigma';

import { REGION_COLOR } from './appearance';
import { getVisibleMembershipLinks } from './membership';
import { getRegionNodeId } from './region-node';
import { getRegionHull } from './regions';

export function createRegionLayer(
    sigmaInstance: Sigma,
    data: NetworkData,
    state: RenderState,
    theme: NetworkTheme,
    regionCanvas: HTMLCanvasElement,
) {
    const network = sigmaInstance.getGraph();
    const regionContext = regionCanvas.getContext('2d');
    const isDark = theme === 'dark';
    const foreground = isDark ? '#e5e7eb' : '#272d38';

    const drawRegions = () => {
        if (!regionContext) {
            return;
        }

        const { width, height } = sigmaInstance.getDimensions();
        const pixelRatio = window.devicePixelRatio || 1;
        const bufferWidth = Math.round(width * pixelRatio);
        const bufferHeight = Math.round(height * pixelRatio);

        if (regionCanvas.width !== bufferWidth) {
            regionCanvas.width = bufferWidth;
        }

        if (regionCanvas.height !== bufferHeight) {
            regionCanvas.height = bufferHeight;
        }

        regionCanvas.style.width = `${width}px`;
        regionCanvas.style.height = `${height}px`;
        regionContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        regionContext.clearRect(0, 0, width, height);
        regionContext.font = '500 12px "Inter Variable", sans-serif';
        regionContext.textBaseline = 'middle';

        regionContext.save();
        regionContext.setLineDash([14, 8]);

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
            regionContext.beginPath();
            const first = hull[0];
            const last = hull[hull.length - 1];
            regionContext.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);

            for (let index = 0; index < hull.length; index++) {
                const point = hull[index];
                const next = hull[(index + 1) % hull.length];
                regionContext.quadraticCurveTo(
                    point.x,
                    point.y,
                    (point.x + next.x) / 2,
                    (point.y + next.y) / 2,
                );
            }

            regionContext.closePath();
            regionContext.fillStyle = isDark ? '#a1a1aa' : '#71717a';
            regionContext.globalAlpha = (highlighted ? 0.08 : 0.035) * searchOpacity;
            regionContext.fill();
            regionContext.strokeStyle = foreground;
            regionContext.globalAlpha = (highlighted ? 0.45 : 0.18) * searchOpacity;
            regionContext.lineWidth = highlighted ? 1.5 : 1;
            regionContext.stroke();
            regionContext.globalAlpha = 1;
        }

        regionContext.restore();
        regionContext.save();
        regionContext.setLineDash([4, 5]);
        regionContext.lineWidth = 1;
        regionContext.strokeStyle = REGION_COLOR[theme];

        for (const link of getVisibleMembershipLinks(
            data.regions,
            state.visibleMembershipMode,
            state.activeNode,
            state.selectedNode,
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

            let opacity = 0.3;

            if (link.emphasized) {
                opacity = 0.6;
            } else if (state.activeNode || state.selectedNode) {
                opacity = 0.16;
            }

            regionContext.globalAlpha =
                opacity *
                (link.emphasized ||
                (state.matchesSearch(link.source) && state.matchesSearch(link.target))
                    ? 1
                    : 0.2);
            regionContext.beginPath();
            regionContext.moveTo(
                start.x + (dx * sourceInset) / distance,
                start.y + (dy * sourceInset) / distance,
            );
            regionContext.lineTo(
                end.x - (dx * targetInset) / distance,
                end.y - (dy * targetInset) / distance,
            );
            regionContext.stroke();
        }

        regionContext.restore();
    };

    sigmaInstance.on('afterRender', drawRegions);
    sigmaInstance.scheduleRender();
    return () => sigmaInstance.off('afterRender', drawRegions);
}
