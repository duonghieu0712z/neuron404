import type { RenderState } from './render-state';
import type Network from 'graphology';
import type { PrimitivesDeclaration } from 'sigma/primitives';

import Sigma, { DEFAULT_DEPTH_LAYERS, DEFAULT_STYLES } from 'sigma';
import { layerPlain, sdfCircle } from 'sigma/rendering';

import { LABEL_FONT_SIZE } from './appearance';
import { getEdgeAppearance } from './edge-appearance';
import { createLabelContinuation } from './label-continuation';
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

    const primitives = {
        depthLayers: [
            ...DEFAULT_DEPTH_LAYERS,
            'regionNodes',
            'selectedNodes',
            'hoveredNodes',
            'labels',
            'multilineLabels',
        ] as const,
        nodes: {
            shapes: [sdfCircle(), regionHexagon()],
            labelAttachments: {
                continuation: ({ attributes, pixelRatio }) =>
                    createLabelContinuation(
                        String(attributes.labelContinuation ?? ''),
                        pixelRatio,
                        Number(attributes.labelContinuationWidth ?? 0),
                    ),
            },
        },
        edges: {
            variables: {
                solidColor: { type: 'color', default: '#00000000' },
            },
            layers: [layerPlain({ color: { attribute: 'solidColor' } })],
        },
    } as const satisfies PrimitivesDeclaration;

    return new Sigma(network, container, {
        primitives,
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
            edges: { ...DEFAULT_STYLES.edges, opacity: 1, depth: 'edges' },
            nodes: {
                ...DEFAULT_STYLES.nodes,
                depth: 'nodes',
                backdropVisibility: 'hidden',
                shape: { attribute: 'shape' },
                labelColor: foreground,
                labelSize: 12,
                labelFont: 'Inter Variable, sans-serif',
                labelPosition: 'below',
                // Sigma caches one label buffer across depth passes.
                labelDepth: 'labels',
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
            const fullLabel = state.expandedLabels[id] ?? nodeAttributes.label;
            const multiline = fullLabel.includes('\n');
            const above = state.labelPlacements.get(id) === 'above';
            const expandedLabel = {
                label: multiline
                    ? String(nodeAttributes.labelContinuationAnchor ?? fullLabel.split('\n')[0])
                    : fullLabel,
                labelSize: LABEL_FONT_SIZE,
                labelColor: multiline ? '#00000000' : foreground,
                labelAttachment: multiline ? 'continuation' : null,
                labelAttachmentPlacement: above ? ('above' as const) : ('below' as const),
                backdropArea: 'both' as const,
            };
            const searchDimmed =
                !state.matchesSearch(id) && !expanded && !state.neighborhood.has(id);
            const dimmedColor = dimmedColors.get(attributes.color);

            const nodeDepth = (['nodes', 'regionNodes', 'selectedNodes', 'hoveredNodes'] as const)[
                state.focusPriority(id)
            ];

            if (state.activeEdge || state.activeMembership) {
                const highlighted = state.edgeEndpoints.has(id) || id === state.selectedNode;
                const placement = state.labelPlacements.get(id);

                return {
                    color: highlighted ? attributes.color : dimmedColor,
                    opacity: 1,
                    ...expandedLabel,
                    labelVisibility: highlighted && placement ? 'visible' : 'hidden',
                    labelPosition: placement ?? 'below',
                    depth: highlighted ? nodeDepth : 'nodes',
                    backdropArea: expandedLabel.backdropArea,
                    backdropVisibility: highlighted && placement ? 'visible' : 'hidden',
                };
            }

            if (state.regionByNodeId.has(id)) {
                return {
                    ...attributes,
                    ...expandedLabel,
                    labelVisibility: state.labelPlacements.has(id) ? 'visible' : 'hidden',
                    labelPosition: state.labelPlacements.get(id) ?? 'below',
                    depth: expanded ? nodeDepth : 'nodes',
                    color: searchDimmed ? dimmedColor : attributes.color,
                    opacity: 1,
                    backdropArea: expandedLabel.backdropArea,
                    backdropVisibility:
                        state.labelPlacements.has(id) && (expanded || expandedLabel.labelAttachment)
                            ? 'visible'
                            : 'hidden',
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
                ? expandedLabel.label
                : (state.compactLabels[id] ?? nodeAttributes.shortLabel);
            const labelAttachment = expanded ? expandedLabel.labelAttachment : null;
            const labelSize = expanded ? expandedLabel.labelSize : LABEL_FONT_SIZE;
            const labelColor = expanded ? expandedLabel.labelColor : foreground;

            const placement = state.labelPlacements.get(id);

            const labelVisibility =
                (state.neuronLabelsVisible || expanded) && placement ? 'visible' : 'hidden';

            if (!state.activeNode) {
                return {
                    ...attributes,
                    label,
                    labelSize,
                    labelColor,
                    labelAttachment,
                    labelAttachmentPlacement: expandedLabel.labelAttachmentPlacement,
                    labelVisibility,
                    labelPosition: placement ?? 'below',
                };
            }

            if (!state.neighborhood.has(id) && id !== state.selectedNode) {
                return { color: dimmedColor, opacity: 1, labelVisibility: 'hidden' };
            }

            return {
                label,
                labelSize,
                labelColor,
                labelAttachment,
                labelAttachmentPlacement: expandedLabel.labelAttachmentPlacement,
                opacity: 1,
                labelVisibility,
                labelPosition: placement ?? 'below',
                depth: expanded ? nodeDepth : 'nodes',
                backdropArea: expandedLabel.backdropArea,
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
                    depth: highlighted ? 'topEdges' : 'edges',
                };
            }

            if (state.searchMatches !== null && !state.activeNode) {
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
