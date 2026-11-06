<script lang="ts">
    import type { PageProps } from './$types';
    import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

    import MaximizeIcon from '@lucide/svelte/icons/maximize';
    import MinusIcon from '@lucide/svelte/icons/minus';
    import PauseIcon from '@lucide/svelte/icons/pause';
    import PlayIcon from '@lucide/svelte/icons/play';
    import PlusIcon from '@lucide/svelte/icons/plus';
    import TagsIcon from '@lucide/svelte/icons/tags';
    import Network from 'graphology';
    import { mode } from 'mode-watcher';
    import Sigma, { DEFAULT_DEPTH_LAYERS, DEFAULT_STYLES } from 'sigma';
    import { layerPlain, sdfCircle } from 'sigma/rendering';

    import NetworkSection from '#lib/components/network-section.svelte';
    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent } from '#lib/components/ui/card';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';
    import { getEdgeAppearance } from '#lib/network/edge-appearance';
    import { chooseLabelPlacements, type LabelPlacement } from '#lib/network/labels';
    import { getRegionNodeId, regionHexagon } from '#lib/network/region-node';
    import { getRegionHull } from '#lib/network/regions';
    import { createNetworkSimulation, getNodeEntranceOffset } from '#lib/network/simulation';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';
    import { GROUNDING_LEVELS, SYNAPSE_KINDS } from '#lib/neuron/schema';

    let { data }: PageProps = $props();

    const panel = getNeuronPanelContext();

    const NODE_SIZE = 8;
    const LABEL_MAX_LENGTH = 40;
    const LABEL_MAX_WIDTH = 140;

    function shortenLabel(title: string) {
        const characters = Array.from(title);
        return characters.length > LABEL_MAX_LENGTH
            ? `${characters
                  .slice(0, LABEL_MAX_LENGTH - 3)
                  .join('')
                  .trimEnd()}...`
            : title;
    }

    type SynapseKind = (typeof SYNAPSE_KINDS)[number];

    type SimNode = PageProps['data']['nodes'][number] & SimulationNodeDatum & { regionId?: string };

    interface SimLink extends SimulationLinkDatum<SimNode> {
        kind: string;
        sourceId: string;
        targetId: string;
    }

    const SYNAPSE_COLORS: Record<SynapseKind, { dark: string; light: string }> = {
        cites: { dark: '#c98500', light: '#eda100' },
        contradicts: { dark: '#d95926', light: '#eb6834' },
        extends: { dark: '#199e70', light: '#1baf7a' },
        questions: { dark: '#d55181', light: '#e87ba4' },
        supports: { dark: '#3987e5', light: '#2a78d6' },
    };

    const GROUNDING_COLORS: Record<string, { dark: string; light: string }> = {
        sourced: { dark: '#7cafff', light: '#356bd6' },
        inferred: { dark: '#d8ad65', light: '#a16a17' },
        assumption: { dark: '#c19aeb', light: '#9053bc' },
    };
    const REGION_COLOR = { dark: '#b7c5c0', light: '#506a60' };

    let overviewOpen = $state(true);
    let controlsOpen = $state(true);
    const sections = $state({
        regions: true,
        legend: true,
        shape: true,
        nodeColor: true,
        stroke: true,
        edgeColor: true,
    });
    const theme = $derived(mode.current === 'dark' ? 'dark' : 'light');
    const groundingCounts = $derived(
        Object.fromEntries(
            GROUNDING_LEVELS.map((level) => [
                level,
                data.nodes.filter((node) => node.grounding === level).length,
            ]),
        ),
    );
    const synapseCounts = $derived(
        Object.fromEntries(
            SYNAPSE_KINDS.map((kind) => [
                kind,
                data.edges.filter((edge) => edge.kind === kind).length,
            ]),
        ),
    );

    let containerEl = $state<HTMLDivElement>();
    let renderer = $state.raw<Sigma | null>(null);
    let hoveredNode = $state<string | null>(null);
    const selectedRegionId = $derived(panel.region?.region.id ?? null);
    let showLabels = $state(true);
    let motionEnabled = $state(true);
    let reducedMotion = $state(false);
    let applyMotion = $state<((enabled: boolean) => void) | null>(null);
    let applyLabels = $state<((visible: boolean) => void) | null>(null);
    let applyFocus = $state<((id: string | null, selected: string | null) => void) | null>(null);
    const positions: Record<string, { x: number; y: number } | undefined> = {};

    function fitNetworkInView() {
        if (!renderer) return;
        const graph = renderer.getGraph();
        const nodes = graph.nodes().filter((id) => !renderer!.getNodeState(id).isHidden);
        if (nodes.length === 0) return;

        const xs = nodes.map((id) => graph.getNodeAttribute(id, 'x') as number);
        const ys = nodes.map((id) => graph.getNodeAttribute(id, 'y') as number);
        const min = { x: Math.min(...xs), y: Math.min(...ys) };
        const max = { x: Math.max(...xs), y: Math.max(...ys) };
        const center = renderer.graphToFramedGraph({
            x: (min.x + max.x) / 2,
            y: (min.y + max.y) / 2,
        });
        const cameraState = { ...center, angle: 0, ratio: 1 };
        const start = renderer.graphToViewport(min, { cameraState });
        const end = renderer.graphToViewport(max, { cameraState });
        const { width, height } = renderer.getDimensions();
        const padding = Math.min(renderer.getStagePadding(), Math.min(width, height) / 4);
        const ratio = Math.max(
            renderer.getSetting('minCameraRatio') ?? 0.15,
            Math.abs(end.x - start.x) / Math.max(1, width - padding * 2),
            Math.abs(end.y - start.y) / Math.max(1, height - padding * 2),
        );
        if (ratio > (renderer.getSetting('maxCameraRatio') ?? Infinity)) {
            renderer.setSetting('maxCameraRatio', ratio);
        }
        void renderer.getCamera().animate({ ...cameraState, ratio }, { duration: 250 });
    }

    const controls = [
        {
            label: 'Zoom in',
            icon: PlusIcon,
            action: () => renderer?.getCamera().zoomIn({ duration: 200 }),
        },
        {
            label: 'Zoom out',
            icon: MinusIcon,
            action: () => renderer?.getCamera().zoomOut({ duration: 200 }),
        },
        {
            label: 'Reset view',
            icon: MaximizeIcon,
            action: fitNetworkInView,
        },
    ];
    const focusedRegion = $derived(
        data.regions.find((region) =>
            hoveredNode
                ? getRegionNodeId(region.id) === hoveredNode
                : region.id === selectedRegionId,
        ),
    );
    const focusedNode = $derived(
        data.nodes.find((node) => node.id === (hoveredNode ?? panel.selected?.neuron.id)),
    );
    const connectionCount = $derived(
        focusedNode
            ? data.edges.filter(
                  (edge) => edge.source === focusedNode.id || edge.target === focusedNode.id,
              ).length
            : 0,
    );

    $effect(() => {
        const selected = selectedRegionId
            ? getRegionNodeId(selectedRegionId)
            : (panel.selected?.neuron.id ?? null);
        applyFocus?.(hoveredNode ?? selected, selected);
    });

    $effect(() => {
        applyLabels?.(showLabels);
    });

    $effect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updatePreference = () => {
            reducedMotion = media.matches;
        };
        updatePreference();
        media.addEventListener('change', updatePreference);
        return () => media.removeEventListener('change', updatePreference);
    });

    $effect(() => {
        applyMotion?.(motionEnabled && !reducedMotion);
    });

    $effect(() => {
        if (!containerEl || data.nodes.length === 0) return;

        const isDark = mode.current === 'dark';
        const theme = isDark ? 'dark' : 'light';
        const foreground = isDark ? '#e5e7eb' : '#272d38';
        const surface = isDark ? '#20242c' : '#ffffff';
        let activeNode: string | null = null;
        let selectedNode: string | null = null;
        let neuronLabelsVisible = true;
        let neighborhood = new Set<string>();
        let labelPlacements = new Map<string, LabelPlacement>();
        const compactLabels: Record<string, string | undefined> = Object.create(null);

        const regionByNodeId = new Map(
            data.regions.map((region) => [getRegionNodeId(region.id), region]),
        );
        const nodeIds = new Set(data.nodes.map((node) => node.id));
        const visualNodes: SimNode[] = [
            ...data.nodes,
            ...data.regions.map((region) => ({
                id: getRegionNodeId(region.id),
                title: region.title,
                grounding: 'region',
                regions: [region.id],
                regionId: region.id,
            })),
        ];
        const simNodes: SimNode[] = visualNodes.map((node) => ({
            ...node,
            x: positions[node.id]?.x ?? 0,
            y: positions[node.id]?.y ?? 0,
        }));
        const simNodeById = new Map(simNodes.map((node) => [node.id, node]));
        let draggedNode: string | null = null;
        let motionAllowed = false;
        const simLinks: SimLink[] = data.edges
            .filter(
                (edge) =>
                    edge.source !== edge.target &&
                    nodeIds.has(edge.source) &&
                    nodeIds.has(edge.target),
            )
            .map((edge) => ({
                kind: edge.kind,
                source: edge.source,
                sourceId: edge.source,
                target: edge.target,
                targetId: edge.target,
            }));

        const hasSavedPositions = simNodes.every((node) => positions[node.id]);
        let entranceActive =
            !hasSavedPositions && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const simulation = createNetworkSimulation(simNodes, simLinks, !hasSavedPositions);

        const network = new Network({ multi: true, type: 'directed' });

        const degrees: Record<string, number> = {};
        for (const link of simLinks) {
            degrees[link.sourceId] = (degrees[link.sourceId] ?? 0) + 1;
            degrees[link.targetId] = (degrees[link.targetId] ?? 0) + 1;
        }

        for (const node of simNodes) {
            const degree = degrees[node.id] ?? 0;
            const position = positions[node.id];
            const entrance = entranceActive
                ? getNodeEntranceOffset(node.index ?? 0, 0)
                : { x: 0, y: 0 };
            network.addNode(node.id, {
                color: node.regionId
                    ? REGION_COLOR[theme]
                    : (GROUNDING_COLORS[node.grounding] ?? GROUNDING_COLORS.assumption)[theme],
                shape: node.regionId ? 'hexagon' : 'circle',
                label: node.title,
                shortLabel: node.regionId ? node.title : shortenLabel(node.title),
                size: node.regionId ? 18 : NODE_SIZE + Math.min(12, Math.sqrt(degree) * 3),
                x: (position?.x ?? node.x ?? 0) + entrance.x,
                y: (position?.y ?? node.y ?? 0) + entrance.y,
            });
        }

        for (const link of simLinks) {
            const color = SYNAPSE_COLORS[link.kind as SynapseKind][theme];
            network.addEdge(link.sourceId, link.targetId, {
                color,
                kind: link.kind,
                ...getEdgeAppearance(color),
            });
        }

        const sigmaInstance = new Sigma(network, containerEl, {
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
                nodeLabelEvents: 'extend',
                labelRenderedSizeThreshold: 0,
                minCameraRatio: 0.15,
                maxCameraRatio: 5,
                stagePadding: 80,
            },
            styles: {
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
                    cursor: { whenState: 'isDragged', then: 'grabbing', else: 'grab' },
                },
            },
            nodeReducer: (id, attributes, nodeAttributes) => {
                const expanded = id === activeNode || id === selectedNode;
                const labelDepth =
                    id === activeNode
                        ? 'hoveredLabels'
                        : id === selectedNode
                          ? 'selectedLabels'
                          : regionByNodeId.has(id)
                            ? 'regionLabels'
                            : 'nodes';
                if (regionByNodeId.has(id))
                    return {
                        ...attributes,
                        label: nodeAttributes.label,
                        labelVisibility: 'visible',
                        labelPosition: 'below',
                        labelDepth,
                        depth: expanded ? labelDepth : 'nodes',
                        opacity: 1,
                        backdropArea: 'both',
                        backdropVisibility: expanded ? 'visible' : 'hidden',
                    };
                const label = expanded
                    ? nodeAttributes.label
                    : (compactLabels[id] ?? nodeAttributes.shortLabel);
                const placement = labelPlacements.get(id);
                const labelVisibility =
                    (neuronLabelsVisible || expanded) && placement ? 'visible' : 'hidden';
                if (!activeNode)
                    return {
                        ...attributes,
                        label,
                        labelVisibility,
                        labelPosition: placement ?? 'below',
                        labelDepth,
                    };
                if (!neighborhood.has(id) && id !== selectedNode) {
                    return { opacity: 0.2, labelVisibility: 'hidden' };
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
                if (!activeNode) return attributes;
                const connected = regionByNodeId.has(activeNode)
                    ? neighborhood.has(network.source(id)) && neighborhood.has(network.target(id))
                    : network.source(id) === activeNode || network.target(id) === activeNode;
                return {
                    ...getEdgeAppearance(
                        network.getEdgeAttribute(id, 'color'),
                        connected ? 0.95 : 0.12,
                    ),
                    size: connected ? 2.5 : 1,
                };
            },
        });

        renderer = sigmaInstance;
        const regionCanvas = sigmaInstance.createCanvas('regions', {
            beforeLayer: 'stage',
            style: { pointerEvents: 'none', left: '0', top: '0' },
        });
        regionCanvas.setAttribute('aria-hidden', 'true');
        const regionContext = regionCanvas.getContext('2d');
        const labelWidths: Record<string, number | undefined> = Object.create(null);
        const measureLabel = (label: string) => {
            let width = labelWidths[label];
            if (width === undefined) {
                width = regionContext?.measureText(label).width ?? Array.from(label).length * 8;
                labelWidths[label] = width;
            }
            return width;
        };
        const layoutLabels = () => {
            sigmaInstance.resize();
            const { width, height } = sigmaInstance.getDimensions();
            const cameraState = sigmaInstance.getCamera().getState();
            if (regionContext) regionContext.font = '12px "Inter Variable", sans-serif';
            const textChanged: string[] = [];
            const candidates = network
                .nodes()
                .filter(
                    (id) =>
                        !sigmaInstance.getNodeState(id).isHidden &&
                        (regionByNodeId.has(id) ||
                            id === activeNode ||
                            id === selectedNode ||
                            (neuronLabelsVisible &&
                                (!activeNode || neighborhood.has(id) || id === selectedNode))),
                )
                .map((id) => {
                    const attributes = network.getNodeAttributes(id);
                    const isRegion = regionByNodeId.has(id);
                    const expanded = isRegion || id === activeNode || id === selectedNode;
                    if (compactLabels[id] === undefined) {
                        let compact: string = attributes.shortLabel;
                        if (measureLabel(compact) > LABEL_MAX_WIDTH) {
                            const characters = Array.from(compact.replace(/\.{3}$/, ''));
                            do {
                                characters.pop();
                                compact = `${characters.join('').trimEnd()}...`;
                            } while (characters.length && measureLabel(compact) > LABEL_MAX_WIDTH);
                        }
                        compactLabels[id] = compact;
                        textChanged.push(id);
                    }
                    const label = expanded ? attributes.label : compactLabels[id]!;
                    const position = sigmaInstance.graphToViewport(
                        { x: attributes.x, y: attributes.y },
                        { cameraState },
                    );
                    return {
                        id,
                        ...position,
                        width: measureLabel(label),
                        radius: sigmaInstance.scaleSize(attributes.size),
                        required: expanded,
                        priority:
                            id === activeNode
                                ? 3
                                : id === selectedNode
                                  ? 2
                                  : regionByNodeId.has(id)
                                    ? 1
                                    : 0,
                    };
                });
            const next = chooseLabelPlacements(candidates, width, height);
            const changed = network
                .nodes()
                .filter(
                    (id) => textChanged.includes(id) || next.get(id) !== labelPlacements.get(id),
                );
            labelPlacements = next;
            if (changed.length)
                sigmaInstance.refresh({
                    partialGraph: { nodes: changed },
                    skipIndexation: true,
                    schedule: true,
                });
        };
        sigmaInstance.on('beforeRender', layoutLabels);
        let disposed = false;
        void document.fonts.ready.then(() => {
            if (disposed) return;
            for (const label of Object.keys(labelWidths)) delete labelWidths[label];
            for (const id of Object.keys(compactLabels)) delete compactLabels[id];
            sigmaInstance.scheduleRender();
        });
        const drawRegions = () => {
            if (!regionContext) return;
            const { width, height } = sigmaInstance.getDimensions();
            const pixelRatio = window.devicePixelRatio || 1;
            const bufferWidth = Math.round(width * pixelRatio);
            const bufferHeight = Math.round(height * pixelRatio);
            if (regionCanvas.width !== bufferWidth) regionCanvas.width = bufferWidth;
            if (regionCanvas.height !== bufferHeight) regionCanvas.height = bufferHeight;
            regionCanvas.style.width = `${width}px`;
            regionCanvas.style.height = `${height}px`;
            regionContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            regionContext.clearRect(0, 0, width, height);
            regionContext.font = '500 12px "Inter Variable", sans-serif';
            regionContext.textBaseline = 'middle';

            for (const region of data.regions) {
                const members = [...region.nodeIds, getRegionNodeId(region.id)].filter(
                    (id) => !sigmaInstance.getNodeState(id).isHidden,
                );
                if (!members.length) continue;
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
                if (!hull.length) continue;
                const highlighted = activeNode !== null && members.includes(activeNode);
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
                regionContext.globalAlpha = highlighted ? 0.08 : 0.035;
                regionContext.fill();
                regionContext.strokeStyle = foreground;
                regionContext.globalAlpha = highlighted ? 0.45 : 0.18;
                regionContext.lineWidth = highlighted ? 1.5 : 1;
                regionContext.stroke();
                regionContext.globalAlpha = 1;
            }
        };
        sigmaInstance.on('afterRender', drawRegions);
        sigmaInstance.scheduleRender();
        applyLabels = (visible) => {
            neuronLabelsVisible = visible;
            sigmaInstance.refresh();
        };
        applyFocus = (id, selected) => {
            activeNode = id && network.hasNode(id) ? id : null;
            selectedNode = selected && network.hasNode(selected) ? selected : null;
            const region = activeNode ? regionByNodeId.get(activeNode) : undefined;
            neighborhood = new Set(
                activeNode
                    ? region
                        ? [activeNode, ...region.nodeIds]
                        : [
                              activeNode,
                              ...network.neighbors(activeNode),
                              ...data.regions
                                  .filter((item) => item.nodeIds.includes(activeNode!))
                                  .map((item) => getRegionNodeId(item.id)),
                          ]
                    : [],
            );
            sigmaInstance.refresh();
        };

        sigmaInstance.on('enterNode', ({ node }) => {
            hoveredNode = node;
        });
        sigmaInstance.on('leaveNode', () => {
            hoveredNode = null;
        });
        let motionFrame: number | null = null;
        const motionStartedAt = performance.now();
        const syncPositions = (elapsed: number) => {
            network.updateEachNodeAttributes(
                (id, attributes) => {
                    if (id === draggedNode) return attributes;
                    const node = simNodeById.get(id)!;
                    const position = { x: node.x ?? 0, y: node.y ?? 0 };
                    positions[id] = position;
                    const entrance =
                        motionAllowed && entranceActive
                            ? getNodeEntranceOffset(node.index ?? 0, elapsed)
                            : { x: 0, y: 0 };
                    return {
                        ...attributes,
                        x: position.x + entrance.x,
                        y: position.y + entrance.y,
                    };
                },
                { attributes: ['x', 'y'] },
            );
        };
        const animateMotion = (time: number) => {
            const elapsed = time - motionStartedAt;
            syncPositions(elapsed);
            if (elapsed < 1800 && entranceActive) {
                motionFrame = requestAnimationFrame(animateMotion);
            } else {
                entranceActive = false;
                motionFrame = null;
            }
        };
        const stopMotion = () => {
            if (motionFrame !== null) cancelAnimationFrame(motionFrame);
            motionFrame = null;
        };
        const startMotion = () => {
            if (motionFrame === null) motionFrame = requestAnimationFrame(animateMotion);
        };

        const freezePositions = () => {
            simulation.stop().alphaTarget(0);
            stopMotion();
            entranceActive = false;
            for (const node of simNodes) {
                node.x = network.getNodeAttribute(node.id, 'x');
                node.y = network.getNodeAttribute(node.id, 'y');
                node.vx = 0;
                node.vy = 0;
                positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 };
            }
        };

        simulation.on('tick', () => syncPositions(0));
        simulation.on('end', () => {
            simulation.alpha(0);
            for (const node of simNodes) {
                node.vx = 0;
                node.vy = 0;
            }
        });

        applyMotion = (enabled) => {
            motionAllowed = enabled;
            if (!enabled) freezePositions();
            else if (!document.hidden) {
                if (entranceActive) startMotion();
                if (simulation.alpha() > simulation.alphaMin()) simulation.restart();
            }
        };

        const handleVisibility = () => {
            if (document.hidden) {
                stopMotion();
                simulation.stop();
            } else {
                if (motionAllowed && entranceActive) startMotion();
                if (motionAllowed && simulation.alpha() > simulation.alphaMin())
                    simulation.restart();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        sigmaInstance.on('nodeDragStart', ({ node }) => {
            freezePositions();
            draggedNode = node;
            const target = simNodeById.get(node)!;
            target.fx = network.getNodeAttribute(node, 'x');
            target.fy = network.getNodeAttribute(node, 'y');
            simulation.alpha(0.25).alphaTarget(0.25).restart();
        });
        sigmaInstance.on('nodeDrag', ({ node }) => {
            const target = simNodeById.get(node)!;
            target.fx = network.getNodeAttribute(node, 'x');
            target.fy = network.getNodeAttribute(node, 'y');
            target.x = target.fx ?? 0;
            target.y = target.fy ?? 0;
        });
        sigmaInstance.on('nodeDragEnd', ({ node }) => {
            const target = simNodeById.get(node)!;
            target.fx = null;
            target.fy = null;
            draggedNode = null;
            positions[node] = { x: target.x ?? 0, y: target.y ?? 0 };
            if (motionAllowed) simulation.alphaTarget(0).restart();
            else freezePositions();
        });

        sigmaInstance.on('clickNode', ({ node, event }) => {
            event.original.stopPropagation();
            const region = regionByNodeId.get(node);
            if (region) void panel.openRegion(region.id);
            else void panel.open(node);
        });

        sigmaInstance.on('clickStage', ({ event }) => {
            event.original.stopPropagation();
            panel.close();
        });

        const resizeObserver = new ResizeObserver((entries) => {
            const { width, height } = entries[0]?.contentRect ?? { height: 0, width: 0 };
            if (width === 0 || height === 0) return;

            sigmaInstance.scheduleRender();
        });
        resizeObserver.observe(containerEl);

        return () => {
            disposed = true;
            sigmaInstance.off('beforeRender', layoutLabels);
            sigmaInstance.off('afterRender', drawRegions);
            resizeObserver.disconnect();
            document.removeEventListener('visibilitychange', handleVisibility);
            simulation.stop();
            stopMotion();
            applyMotion = null;
            applyFocus = null;
            applyLabels = null;
            renderer = null;
            sigmaInstance.kill();
        };
    });
</script>

<svelte:head>
    <title>Network · neuron404</title>
</svelte:head>

{#snippet legendRow(
    label: string,
    count: number,
    shape: 'circle' | 'hexagon' | 'line',
    color = 'currentColor',
)}
    <div class="flex items-center gap-2 text-xs">
        <span class="flex w-4 shrink-0 items-center justify-center" aria-hidden="true">
            <span
                class={shape === 'line'
                    ? 'h-0.5 w-4'
                    : shape === 'circle'
                      ? 'size-2.5 rounded-full'
                      : 'h-3 w-2.5'}
                style:background-color={color}
                style:clip-path={shape === 'hexagon'
                    ? 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)'
                    : undefined}
            ></span>
        </span>
        <span class="min-w-0 flex-1 text-muted-foreground">{label}</span>
        <span class="tabular-nums">{count}</span>
    </div>
{/snippet}

<section
    class="network-surface relative h-full min-h-0 overflow-hidden"
    aria-label="Knowledge network"
>
    {#if data.nodes.length === 0}
        <div class="flex h-full items-center justify-center">
            <p class="text-sm text-muted-foreground">
                Saved neurons and their connections will appear here.
            </p>
        </div>
    {:else}
        <div
            bind:this={containerEl}
            data-neuron-trigger
            class="absolute inset-0"
            aria-label="Interactive neuron network"
        ></div>
    {/if}

    <Card
        size="sm"
        class={[
            'absolute top-4 left-4 max-h-[calc(100%-2rem)] max-w-[calc(100%-5rem)] gap-0 bg-card/95 py-0 shadow-sm backdrop-blur-sm',
            overviewOpen ? 'w-72' : 'w-auto',
        ]}
        data-neuron-trigger
    >
        <NetworkSection
            title="Overview"
            iconOnly
            bind:open={overviewOpen}
            class="flex min-h-0 flex-col"
            contentClass="flex min-h-0 flex-col"
        >
            {#snippet summary()}
                <span class="mr-3 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {data.neuronCount} neurons · {data.synapseCount} synapses
                </span>
            {/snippet}
            <CardContent class="flex min-h-0 flex-col gap-2 px-2 pb-3">
                <NetworkSection
                    title="Regions"
                    count={data.regions.length}
                    bind:open={sections.regions}
                    class={sections.regions ? 'flex min-h-20 shrink-9999 flex-col' : 'shrink-0'}
                    contentClass="flex min-h-0 flex-col"
                >
                    <ScrollArea class="network-panel-scroll flex max-h-48 min-h-0 flex-col">
                        <div class="space-y-0.5 p-1">
                            {#each data.regions as region (region.id)}
                                <Button
                                    variant={selectedRegionId === region.id ? 'secondary' : 'ghost'}
                                    class="h-auto w-full justify-between gap-3 px-2 py-1.5 text-xs"
                                    aria-pressed={selectedRegionId === region.id}
                                    onclick={() => void panel.openRegion(region.id)}
                                >
                                    <span class="min-w-0 truncate">{region.title}</span>
                                    <span class="tabular-nums">{region.nodeIds.length}</span>
                                </Button>
                            {/each}
                        </div>
                    </ScrollArea>
                </NetworkSection>
                <div class="flex min-h-0 flex-col border-t pt-2">
                    <NetworkSection
                        title="Legend"
                        bind:open={sections.legend}
                        class="flex min-h-0 flex-col"
                        contentClass="flex min-h-0 flex-col"
                    >
                        <ScrollArea class="network-panel-scroll flex min-h-0 flex-col">
                            <div class="space-y-0.5">
                                <NetworkSection title="Neuron shape" bind:open={sections.shape}>
                                    <div class="space-y-1.5 px-2 py-1.5">
                                        {@render legendRow('Neuron', data.neuronCount, 'circle')}
                                        {@render legendRow(
                                            'Region overview',
                                            data.regions.length,
                                            'hexagon',
                                        )}
                                    </div>
                                </NetworkSection>
                                <NetworkSection
                                    title="Neuron color · grounding"
                                    bind:open={sections.nodeColor}
                                >
                                    <div class="space-y-1.5 px-2 py-1.5">
                                        {#each GROUNDING_LEVELS as grounding (grounding)}
                                            {@render legendRow(
                                                grounding,
                                                groundingCounts[grounding],
                                                'circle',
                                                GROUNDING_COLORS[grounding][theme],
                                            )}
                                        {/each}
                                        {@render legendRow(
                                            'Region overview',
                                            data.regions.length,
                                            'hexagon',
                                            REGION_COLOR[theme],
                                        )}
                                    </div>
                                </NetworkSection>
                                <NetworkSection title="Synapse stroke" bind:open={sections.stroke}>
                                    <div class="space-y-1.5 px-2 py-1.5">
                                        {@render legendRow(
                                            'Solid · all synapses',
                                            data.synapseCount,
                                            'line',
                                        )}
                                    </div>
                                </NetworkSection>
                                <NetworkSection
                                    title="Synapse color · relation"
                                    bind:open={sections.edgeColor}
                                >
                                    <div class="space-y-1.5 px-2 py-1.5">
                                        {#each SYNAPSE_KINDS as kind (kind)}
                                            {@render legendRow(
                                                kind,
                                                synapseCounts[kind],
                                                'line',
                                                SYNAPSE_COLORS[kind][theme],
                                            )}
                                        {/each}
                                    </div>
                                </NetworkSection>
                            </div>
                        </ScrollArea>
                    </NetworkSection>
                </div>
                {#if focusedNode && !focusedRegion}
                    <div class="shrink-0 space-y-1 border-t px-2 pt-3">
                        <p class="text-sm font-medium">{focusedNode.title}</p>
                        <p class="text-xs text-muted-foreground">
                            {focusedNode.grounding} · {connectionCount} synapses
                        </p>
                        <div class="flex flex-wrap gap-1 pt-1" aria-label="Regions">
                            {#each data.regions.filter( (region) => region.nodeIds.includes(focusedNode.id) ) as region (region.id)}
                                <Badge variant="secondary">{region.title}</Badge>
                            {/each}
                        </div>
                    </div>
                {/if}
            </CardContent>
        </NetworkSection>
    </Card>

    <TooltipProvider>
        <Card
            class="absolute right-4 bottom-4 gap-0 bg-card/95 p-1 shadow-sm backdrop-blur-sm"
            data-neuron-trigger
        >
            <NetworkSection title="Controls" iconOnly vertical bind:open={controlsOpen}>
                <div class="flex flex-col items-center gap-1 pt-1">
                    {#each controls as control (control.label)}
                        <Tooltip>
                            <TooltipTrigger>
                                {#snippet child({ props })}
                                    <Button
                                        {...props}
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={control.label}
                                        disabled={!renderer}
                                        onclick={() => void control.action()}
                                    >
                                        <control.icon class="size-4" />
                                    </Button>
                                {/snippet}
                            </TooltipTrigger>
                            <TooltipContent side="left">{control.label}</TooltipContent>
                        </Tooltip>
                    {/each}
                    <Tooltip>
                        <TooltipTrigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    variant={showLabels ? 'secondary' : 'ghost'}
                                    size="icon-sm"
                                    aria-label="Show neuron labels"
                                    aria-pressed={showLabels}
                                    disabled={!renderer}
                                    onclick={() => {
                                        showLabels = !showLabels;
                                    }}
                                >
                                    <TagsIcon class="size-4" />
                                </Button>
                            {/snippet}
                        </TooltipTrigger>
                        <TooltipContent side="left">Toggle labels</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={motionEnabled && !reducedMotion
                                        ? 'Pause motion'
                                        : 'Resume motion'}
                                    disabled={!renderer || reducedMotion}
                                    onclick={() => {
                                        motionEnabled = !motionEnabled;
                                    }}
                                >
                                    {#if motionEnabled && !reducedMotion}<PauseIcon
                                            class="size-4"
                                        />{:else}<PlayIcon class="size-4" />{/if}
                                </Button>
                            {/snippet}
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            {reducedMotion
                                ? 'Reduced motion is enabled'
                                : motionEnabled
                                  ? 'Pause motion'
                                  : 'Resume motion'}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </NetworkSection>
        </Card>
    </TooltipProvider>
</section>

<style>
    :global(.network-panel-scroll > [data-slot='scroll-area-viewport']) {
        height: auto;
        min-height: 0;
        flex: 1;
    }

    .network-surface {
        background-image: radial-gradient(
            circle,
            color-mix(in oklch, var(--muted-foreground) 18%, transparent) 1px,
            transparent 1px
        );
        background-size: 24px 24px;
    }
</style>
