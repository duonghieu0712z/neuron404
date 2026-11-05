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
    import Sigma, { DEFAULT_STYLES } from 'sigma';
    import { layerPlain, sdfCircle } from 'sigma/rendering';

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

    type SimNode = PageProps['data']['nodes'][number] & SimulationNodeDatum;

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

    let containerEl = $state<HTMLDivElement>();
    let renderer = $state.raw<Sigma | null>(null);
    let hoveredNode = $state<string | null>(null);
    let showLabels = $state(true);
    let motionEnabled = $state(true);
    let reducedMotion = $state(false);
    let applyMotion = $state<((enabled: boolean) => void) | null>(null);
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
        const selected = panel.selected?.neuron.id ?? null;
        applyFocus?.(hoveredNode ?? selected, selected);
    });

    $effect(() => {
        renderer?.setSetting('renderLabels', showLabels);
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
        let neighborhood = new Set<string>();
        let labelPlacements = new Map<string, LabelPlacement>();
        const compactLabels: Record<string, string | undefined> = Object.create(null);

        const nodeIds = new Set(data.nodes.map((node) => node.id));
        const simNodes: SimNode[] = data.nodes.map((node) => ({
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
                color: (GROUNDING_COLORS[node.grounding] ?? GROUNDING_COLORS.assumption)[theme],
                label: node.title,
                shortLabel: shortenLabel(node.title),
                size: NODE_SIZE + Math.min(12, Math.sqrt(degree) * 3),
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
                nodes: { shapes: [sdfCircle()] },
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
                labelRenderedSizeThreshold: 0,
                minCameraRatio: 0.15,
                maxCameraRatio: 5,
                stagePadding: 80,
            },
            styles: {
                edges: { ...DEFAULT_STYLES.edges, opacity: 1 },
                nodes: {
                    ...DEFAULT_STYLES.nodes,
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
                const label = expanded
                    ? nodeAttributes.label
                    : (compactLabels[id] ?? nodeAttributes.shortLabel);
                const placement = labelPlacements.get(id);
                const labelVisibility = placement ? 'visible' : 'hidden';
                if (!activeNode)
                    return {
                        ...attributes,
                        label,
                        labelVisibility,
                        labelPosition: placement ?? 'below',
                    };
                if (!neighborhood.has(id) && id !== selectedNode) {
                    return { opacity: 0.2, labelVisibility: 'hidden' };
                }
                return {
                    label,
                    opacity: 1,
                    labelVisibility,
                    labelPosition: placement ?? 'below',
                    backdropVisibility: expanded && placement ? 'visible' : 'hidden',
                };
            },
            edgeReducer: (id, attributes) => {
                if (!activeNode) return attributes;
                const connected =
                    network.source(id) === activeNode || network.target(id) === activeNode;
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
                        (!activeNode || neighborhood.has(id) || id === selectedNode),
                )
                .map((id) => {
                    const attributes = network.getNodeAttributes(id);
                    const expanded = id === activeNode || id === selectedNode;
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
                        priority: id === activeNode ? 2 : id === selectedNode ? 1 : 0,
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
                const members = region.nodeIds.filter(
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

                const title = `${region.title} · ${members.length}`;
                const textWidth = Math.min(260, regionContext.measureText(title).width);
                const x =
                    (Math.min(...points.map((point) => point.x)) +
                        Math.max(...points.map((point) => point.x))) /
                    2;
                const y = Math.min(...points.map((point) => point.y)) - padding - 12;
                regionContext.beginPath();
                regionContext.roundRect(x - textWidth / 2 - 8, y - 11, textWidth + 16, 22, 3);
                regionContext.fillStyle = surface;
                regionContext.fill();
                regionContext.fillStyle = foreground;
                regionContext.globalAlpha = !activeNode || highlighted ? 0.9 : 0.45;
                regionContext.fillText(title, x - textWidth / 2, y, 260);
                regionContext.globalAlpha = 1;
            }
        };
        sigmaInstance.on('afterRender', drawRegions);
        sigmaInstance.scheduleRender();
        applyFocus = (id, selected) => {
            activeNode = id && network.hasNode(id) ? id : null;
            selectedNode = selected && network.hasNode(selected) ? selected : null;
            neighborhood = new Set(
                activeNode ? [activeNode, ...network.neighbors(activeNode)] : [],
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
            void panel.open(node);
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
            renderer = null;
            sigmaInstance.kill();
        };
    });
</script>

<svelte:head>
    <title>Network · neuron404</title>
</svelte:head>

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
        class="absolute top-4 left-4 max-h-[calc(100%-2rem)] w-64 max-w-[calc(100%-5rem)] gap-0 bg-card/95 py-0 shadow-sm backdrop-blur-sm"
        data-neuron-trigger
    >
        <ScrollArea class="min-h-0 flex-1">
            <CardContent class="space-y-4 p-4">
                <div class="space-y-2">
                    <h1 class="text-sm font-semibold">Overview</h1>
                    <Badge variant="secondary" class="font-normal tabular-nums">
                        {data.neuronCount} neurons · {data.synapseCount} synapses
                    </Badge>
                    <p class="text-xs leading-relaxed text-muted-foreground">
                        Drag a neuron to move its connections. Click to read.
                    </p>
                </div>
                <div class="space-y-2 border-t pt-3">
                    <p
                        class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
                    >
                        Regions
                    </p>
                    {#each data.regions as region (region.id)}
                        <div
                            class="flex items-start justify-between gap-3 text-xs text-muted-foreground"
                        >
                            <span>{region.title}</span>
                            <span class="tabular-nums">{region.nodeIds.length}</span>
                        </div>
                    {/each}
                    <p class="text-[11px] text-muted-foreground">
                        Shaded areas group neurons by region; lines show synapses.
                    </p>
                </div>
                <div class="space-y-2 border-t pt-3">
                    <p
                        class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
                    >
                        Grounding
                    </p>
                    <div class="flex flex-wrap gap-x-3 gap-y-1.5">
                        {#each GROUNDING_LEVELS as grounding (grounding)}
                            <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                    class="size-2 rounded-sm"
                                    style:background-color={GROUNDING_COLORS[grounding][
                                        mode.current === 'dark' ? 'dark' : 'light'
                                    ]}
                                ></span>
                                {grounding}
                            </span>
                        {/each}
                    </div>
                </div>
                <div class="space-y-2 border-t pt-3">
                    <p
                        class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
                    >
                        Connections
                    </p>
                    {#each SYNAPSE_KINDS as kind (kind)}
                        {@const count = data.edges.filter((edge) => edge.kind === kind).length}
                        {#if count > 0}
                            <div class="flex items-center gap-2 text-xs text-muted-foreground">
                                <span
                                    class="h-0.5 w-4"
                                    style:background-color={SYNAPSE_COLORS[kind][
                                        mode.current === 'dark' ? 'dark' : 'light'
                                    ]}
                                ></span>
                                <span class="flex-1">{kind}</span>
                                <span class="tabular-nums">{count}</span>
                            </div>
                        {/if}
                    {/each}
                    <p class="text-[11px] text-muted-foreground">
                        Larger nodes have more connections.
                    </p>
                </div>
                {#if focusedNode}
                    <div class="space-y-1 border-t pt-3">
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
        </ScrollArea>
    </Card>

    <TooltipProvider>
        <Card
            class="absolute right-4 bottom-4 gap-1 bg-card/95 p-1.5 shadow-sm backdrop-blur-sm"
            data-neuron-trigger
        >
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
        </Card>
    </TooltipProvider>
</section>

<style>
    .network-surface {
        background-image: radial-gradient(
            circle,
            color-mix(in oklch, var(--muted-foreground) 18%, transparent) 1px,
            transparent 1px
        );
        background-size: 24px 24px;
    }
</style>
