import type { RenderState } from './render-state';
import type Network from 'graphology';

import Sigma, { DEFAULT_DEPTH_LAYERS, DEFAULT_STYLES } from 'sigma';
import { layerPlain, sdfCircle } from 'sigma/rendering';

import { getEdgeAppearance } from './edge-appearance';
import { createDimmedNodeColors } from './node-appearance';
import { regionHexagon } from './region-node';

export function createSigmaRenderer(
    network: Network,
    container: HTMLDivElement,
    state: RenderState,
    isDark: boolean,
) {
    const foreground = isDark ? '#e5e7eb' : '#272d38';
    const surface = isDark ? '#20242c' : '#ffffff';
    const dimmedColors = createDimmedNodeColors(
        network.mapNodes((id, attributes) => attributes.color as string),
        getComputedStyle(container).getPropertyValue('--background').trim(),
    );

    return new Sigma(network, container, {
        primitives: {
            depthLayers: [
                ...DEFAULT_DEPTH_LAYERS,
                'regionLabels',
                'selectedLabels',
                'hoveredLabels',
            ],
            nodes: { shapes: [sdfCircle(), regionHexagon()] },
            edges: {
                variables: {
                    solidColor: { type: 'color', default: '#00000000' },
                },
                layers: [layerPlain({ color: { attribute: 'solidColor' } })],
            },
        },
        settings: {
            autoRescale: 'once',
            enableNodeDrag: true,
            enableEdgeEvents: true,
            nodeLabelEvents: 'extend',
            labelRenderedSizeThreshold: 0,
            minCameraRatio: 0.15,
            maxCameraRatio: 5,
            stagePadding: 80,
        },
        styles: {
            stage: {
                cursor: { whenState: 'isDragging', then: 'grabbing', else: 'default' },
            },
            edges: { ...DEFAULT_STYLES.edges, opacity: 1 },
            nodes: {
                ...DEFAULT_STYLES.nodes,
                shape: { attribute: 'shape' },
                labelColor: foreground,
                labelSize: 12,
                labelFont: 'Inter Variable, sans-serif',
                labelPosition: 'below',
                backdropColor: surface,
                backdropBorderColor: { attribute: 'color' },
                backdropBorderWidth: 1,
                backdropCornerRadius: 4,
                backdropShadowBlur: 8,
                backdropShadowColor: isDark ? '#00000066' : '#00000012',
                cursor: { whenState: 'isDragged', then: 'grabbing', else: 'pointer' },
                labelCursor: { whenState: 'isDragged', then: 'grabbing', else: 'pointer' },
            },
        },
        nodeReducer: (id, attributes, nodeAttributes) => {
            const expanded = id === state.activeNode || id === state.selectedNode;
            const searchDimmed = !state.matchesSearch(id) && !expanded;
            const dimmedColor = dimmedColors.get(attributes.color);

            const labelDepth = (
                ['nodes', 'regionLabels', 'selectedLabels', 'hoveredLabels'] as const
            )[state.focusPriority(id)];

            if (state.activeEdge || state.activeMembership) {
                const highlighted = state.edgeEndpoints.has(id);
                const placement = state.labelPlacements.get(id);

                return {
                    color: highlighted ? attributes.color : dimmedColor,
                    opacity: 1,
                    label: nodeAttributes.label,
                    labelVisibility: highlighted && placement ? 'visible' : 'hidden',
                    labelPosition: placement ?? 'below',
                    labelDepth,
                    depth: highlighted ? labelDepth : 'nodes',
                    backdropArea: 'both',
                    backdropVisibility: highlighted && placement ? 'visible' : 'hidden',
                };
            }

            if (state.regionByNodeId.has(id)) {
                return {
                    ...attributes,
                    label: nodeAttributes.label,
                    labelVisibility: 'visible',
                    labelPosition: 'below',
                    labelDepth,
                    depth: expanded ? labelDepth : 'nodes',
                    color: searchDimmed ? dimmedColor : attributes.color,
                    opacity: 1,
                    backdropArea: 'both',
                    backdropVisibility: expanded ? 'visible' : 'hidden',
                };
            }

            if (searchDimmed) {
                return {
                    ...attributes,
                    color: dimmedColor,
                    opacity: 1,
                    labelVisibility: 'hidden',
                };
            }

            const label = expanded
                ? nodeAttributes.label
                : (state.compactLabels[id] ?? nodeAttributes.shortLabel);

            const placement = state.labelPlacements.get(id);

            const labelVisibility =
                (state.neuronLabelsVisible || expanded) && placement ? 'visible' : 'hidden';

            if (state.searchMatches !== null || !state.activeNode) {
                return {
                    ...attributes,
                    label,
                    labelVisibility,
                    labelPosition: placement ?? 'below',
                    labelDepth,
                };
            }

            if (!state.neighborhood.has(id) && id !== state.selectedNode) {
                return { color: dimmedColor, opacity: 1, labelVisibility: 'hidden' };
            }

            return {
                label,
                opacity: 1,
                labelVisibility,
                labelPosition: placement ?? 'below',
                labelDepth,
                depth: expanded ? labelDepth : 'nodes',
                backdropArea: 'both',
                backdropVisibility: expanded && placement ? 'visible' : 'hidden',
            };
        },
        edgeReducer: (id, attributes) => {
            const source = network.source(id);
            const target = network.target(id);

            if (state.activeEdge || state.activeMembership) {
                const highlighted = id === state.activeEdge;

                return {
                    ...getEdgeAppearance(
                        network.getEdgeAttribute(id, 'color'),
                        highlighted ? 1 : 0.12,
                    ),
                    size: highlighted ? 3 : 1,
                };
            }

            if (state.searchMatches !== null) {
                const matched = state.matchesSearch(source) && state.matchesSearch(target);

                return {
                    ...getEdgeAppearance(
                        network.getEdgeAttribute(id, 'color'),
                        matched ? 0.95 : 0.12,
                    ),
                    size: matched ? 2.5 : 1,
                };
            }

            const connected =
                state.activeNode &&
                (state.regionByNodeId.has(state.activeNode)
                    ? state.neighborhood.has(source) && state.neighborhood.has(target)
                    : source === state.activeNode || target === state.activeNode);

            if (!connected && (!state.matchesSearch(source) || !state.matchesSearch(target))) {
                return {
                    ...getEdgeAppearance(network.getEdgeAttribute(id, 'color'), 0.12),
                    size: 1,
                };
            }

            if (!state.activeNode) {
                return attributes;
            }

            return {
                ...getEdgeAppearance(
                    network.getEdgeAttribute(id, 'color'),
                    connected ? 0.95 : 0.12,
                ),
                size: connected ? 2.5 : 1,
            };
        },
    });
}
