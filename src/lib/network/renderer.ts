import type { MembershipLink } from './membership-hover';
import type { NetworkData, NetworkPositions, NetworkTheme } from './types';

import { REGION_COLOR, SYNAPSE_COLORS } from './appearance';
import { createNetworkGraph } from './graph';
import { createHoverIntent } from './hover-intent';
import { createLabelLayer } from './label-layer';
import { getVisibleMembershipLinks, type MembershipMode } from './membership';
import { createRegionLayer } from './region-layer';
import { getRegionNodeId } from './region-node';
import { createRenderState } from './render-state';
import { createRendererMotion } from './renderer-motion';
import { createSigmaRenderer } from './renderer-styles';
import { createSynapseSignals } from './synapse-signals';

interface RendererOptions {
    data: NetworkData;
    container: HTMLDivElement;
    positions: NetworkPositions;
    theme: NetworkTheme;
    membershipMode: MembershipMode;
    motionEnabled: boolean;
    onHover: (id: string | null) => void;
    onOpenRegion: (id: string) => void;
    onOpenNeuron: (id: string) => void;
    onClose: () => void;
}

export function createNetworkRenderer(options: RendererOptions) {
    const { data, positions, theme, membershipMode, motionEnabled } = options;

    const state = createRenderState(data, membershipMode);
    const graph = createNetworkGraph(data, positions, theme, motionEnabled);
    const { network, simLinks } = graph;
    const sigmaInstance = createSigmaRenderer(network, options.container, state, theme === 'dark');

    const disposeLabels = createLabelLayer(sigmaInstance, state);
    const disposeRegions = createRegionLayer(sigmaInstance, data, state, theme, (link) => {
        if (link) {
            if (!hover.isOver('node') && !hover.isOver('edge')) {
                hover.enter({ kind: 'membership', link });
            }
        } else if (hover.isOver('membership')) {
            hover.clear();
        }
    });
    const synapseSignals = createSynapseSignals(sigmaInstance, () => state.signalLabelMasks);

    const synapseEdgeIds = network.edges();

    const updateSignals = () => {
        synapseSignals.setLinks([
            ...simLinks.flatMap((link, index) => {
                const connected =
                    !state.activeMembership &&
                    (state.activeEdge
                        ? synapseEdgeIds[index] === state.activeEdge
                        : state.activeNode &&
                          (state.regionByNodeId.has(state.activeNode)
                              ? state.neighborhood.has(link.sourceId) &&
                                state.neighborhood.has(link.targetId)
                              : link.sourceId === state.activeNode ||
                                link.targetId === state.activeNode));

                return connected &&
                    (state.searchMatches === null ||
                        state.activeNode !== null ||
                        (state.matchesSearch(link.sourceId) && state.matchesSearch(link.targetId)))
                    ? [
                          {
                              id: `${link.sourceId}:${link.targetId}:${link.kind}:${index}`,
                              source: link.sourceId,
                              target: link.targetId,
                              color: SYNAPSE_COLORS[link.kind as keyof typeof SYNAPSE_COLORS][
                                  theme
                              ],
                          },
                      ]
                    : [];
            }),
            ...getVisibleMembershipLinks(
                data.regions,
                state.visibleMembershipMode,
                state.activeNode,
                state.selectedNode,
                state.activeMembership,
            )
                .filter((link) => !state.activeEdge && link.emphasized)
                .map((link) => ({
                    id: `membership:${link.source}:${link.target}`,
                    source: link.source,
                    target: link.target,
                    color: REGION_COLOR[theme],
                })),
        ]);
    };

    const setMembership = (mode: MembershipMode) => {
        state.visibleMembershipMode = mode;

        if (mode === 'hidden') {
            setMembershipFocus(null);
        }

        updateSignals();
        sigmaInstance.scheduleRender();
    };

    const setLabels = (visible: boolean) => {
        state.neuronLabelsVisible = visible;
        sigmaInstance.refresh();
    };

    const setFilter = (ids: Set<string> | null) => {
        if (state.searchMatches === ids) {
            return;
        }

        state.searchMatches = ids;
        sigmaInstance.refresh();
    };

    const setFocus = (
        id: string | null,
        selected: string | null,
        regionId: string | null = null,
    ) => {
        state.activeNode =
            id && network.hasNode(id) && !sigmaInstance.getNodeState(id).isHidden ? id : null;
        state.selectedNode =
            selected && network.hasNode(selected) && !sigmaInstance.getNodeState(selected).isHidden
                ? selected
                : null;

        const region = state.activeNode
            ? (state.regionByNodeId.get(state.activeNode) ??
              (state.activeNode === state.selectedNode
                  ? data.regions.find(
                        (region) =>
                            region.id === regionId && region.nodeIds.includes(state.activeNode!),
                    )
                  : undefined))
            : undefined;

        state.neighborhood = new Set<string>();

        if (state.activeNode) {
            const members = region
                ? [
                      ...region.nodeIds,
                      getRegionNodeId(region.id),
                      ...network.neighbors(state.activeNode),
                  ]
                : [
                      ...network.neighbors(state.activeNode),
                      ...data.regions
                          .filter((item) => item.nodeIds.includes(state.activeNode!))
                          .map((item) => getRegionNodeId(item.id)),
                  ];

            state.neighborhood = new Set([state.activeNode, ...members]);
        }

        updateSignals();
        sigmaInstance.refresh();
    };

    const setMembershipFocus = (link: MembershipLink | null) => {
        if (
            state.activeMembership?.source === link?.source &&
            state.activeMembership?.target === link?.target
        ) {
            return;
        }

        state.activeMembership = link;

        let endpoints: string[] = [];

        if (link) {
            endpoints = [link.source, link.target];
        } else if (state.activeEdge) {
            endpoints = network.extremities(state.activeEdge);
        }

        state.edgeEndpoints = new Set(endpoints);
        updateSignals();
        sigmaInstance.refresh();
    };

    const setEdgeFocus = (edge: string | null) => {
        if (state.activeEdge === edge) {
            return;
        }
        state.activeEdge = edge;

        if (edge) {
            state.activeMembership = null;
        }

        state.edgeEndpoints = new Set(edge ? network.extremities(edge) : []);
        updateSignals();
        sigmaInstance.refresh();
    };

    const hover = createHoverIntent((target) => {
        setEdgeFocus(target?.kind === 'edge' ? target.id : null);
        setMembershipFocus(target?.kind === 'membership' ? target.link : null);
        options.onHover(target?.kind === 'node' ? target.id : null);
    });
    const clearHover = () => hover.clear();
    const cancelPendingHover = () => hover.cancelPending();

    sigmaInstance.on('enterEdge', ({ edge }) => hover.enter({ kind: 'edge', id: edge }));
    sigmaInstance.on('leaveEdge', ({ edge }) => hover.leave({ kind: 'edge', id: edge }));
    sigmaInstance.on('enterNode', ({ node }) => hover.enter({ kind: 'node', id: node }));
    sigmaInstance.on('leaveNode', ({ node }) => hover.leave({ kind: 'node', id: node }));
    options.container.addEventListener('pointerleave', clearHover);
    options.container.addEventListener('pointerdown', cancelPendingHover);

    const motion = createRendererMotion(sigmaInstance, graph, positions, synapseSignals);

    sigmaInstance.on('clickNode', ({ node, event }) => {
        event.original.stopPropagation();

        const region = state.regionByNodeId.get(node);

        if (region) {
            void options.onOpenRegion(region.id);
        } else {
            void options.onOpenNeuron(node);
        }
    });

    sigmaInstance.on('clickStage', ({ event }) => {
        event.original.stopPropagation();
        options.onClose();
    });

    const resizeObserver = new ResizeObserver((entries) => {
        const { width, height } = entries[0]?.contentRect ?? { height: 0, width: 0 };

        if (width === 0 || height === 0) {
            return;
        }

        sigmaInstance.scheduleRender();
    });

    resizeObserver.observe(options.container);

    return {
        renderer: sigmaInstance,
        setMembership,
        setLabels,
        setFilter,
        setFocus,
        setMotion: motion.setMotion,
        dispose() {
            hover.dispose();
            options.container.removeEventListener('pointerleave', clearHover);
            options.container.removeEventListener('pointerdown', cancelPendingHover);
            synapseSignals.dispose();
            disposeLabels();
            disposeRegions();
            motion.dispose();
            resizeObserver.disconnect();
            sigmaInstance.kill();
        },
    };
}
