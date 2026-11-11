import type { NetworkData, NetworkPositions, NetworkTheme } from './types';

import { REGION_COLOR, SYNAPSE_COLORS } from './appearance';
import { createNetworkGraph } from './graph';
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

    const regionCanvas = sigmaInstance.createCanvas('regions', {
        beforeLayer: 'stage',
        style: { pointerEvents: 'none', left: '0', top: '0' },
    });
    regionCanvas.setAttribute('aria-hidden', 'true');
    const disposeLabels = createLabelLayer(sigmaInstance, state, regionCanvas.getContext('2d'));
    const disposeRegions = createRegionLayer(sigmaInstance, data, state, theme, regionCanvas);
    const synapseSignals = createSynapseSignals(sigmaInstance, () => state.signalLabelMasks);

    const updateSignals = () => {
        synapseSignals.setLinks([
            ...simLinks.flatMap((link, index) => {
                const connected =
                    state.activeNode &&
                    (state.regionByNodeId.has(state.activeNode)
                        ? state.neighborhood.has(link.sourceId) &&
                          state.neighborhood.has(link.targetId)
                        : link.sourceId === state.activeNode || link.targetId === state.activeNode);

                return connected &&
                    (state.searchMatches === null ||
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
            )
                .filter((link) => link.emphasized)
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

    const setFocus = (id: string | null, selected: string | null) => {
        state.activeNode =
            id && network.hasNode(id) && !sigmaInstance.getNodeState(id).isHidden ? id : null;
        state.selectedNode =
            selected && network.hasNode(selected) && !sigmaInstance.getNodeState(selected).isHidden
                ? selected
                : null;
        const region = state.activeNode ? state.regionByNodeId.get(state.activeNode) : undefined;
        state.neighborhood = new Set<string>();

        if (state.activeNode) {
            const members = region
                ? region.nodeIds
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

    sigmaInstance.on('enterNode', ({ node }) => options.onHover(node));
    sigmaInstance.on('leaveNode', () => options.onHover(null));
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
            synapseSignals.dispose();
            disposeLabels();
            disposeRegions();
            motion.dispose();
            resizeObserver.disconnect();
            sigmaInstance.kill();
        },
    };
}
