<script lang="ts">
    import type { PageProps } from './$types';
    import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import {
        forceCenter,
        forceCollide,
        forceLink,
        forceManyBody,
        forceSimulation,
        forceX,
        forceY,
    } from 'd3-force';
    import Graph from 'graphology';
    import { mode } from 'mode-watcher';
    import Sigma, { DEFAULT_STYLES } from 'sigma';

    import { Button } from '#lib/components/ui/button';
    import { SYNAPSE_KINDS } from '#lib/neuron/schema';

    let { data }: PageProps = $props();

    const WIDTH = 900;
    const HEIGHT = 620;
    const NODE_SIZE = 8;

    type SynapseKind = (typeof SYNAPSE_KINDS)[number];

    interface SimNode extends SimulationNodeDatum {
        id: string;
        title: string;
    }

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

    const FOREGROUND = { dark: 'oklch(0.985 0 0)', light: 'oklch(0.145 0 0)' };

    let containerEl = $state<HTMLDivElement>();

    function cssColorToRgb(cssColor: string): string {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return cssColor;
        ctx.fillStyle = cssColor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
    }

    $effect(() => {
        if (!containerEl) return;

        const isDark = mode.current === 'dark';
        const nodeColor = cssColorToRgb(FOREGROUND[isDark ? 'dark' : 'light']);

        const nodeIds = new Set(data.nodes.map((node) => node.id));
        const simNodes: SimNode[] = data.nodes.map((node) => ({ ...node, x: 0, y: 0 }));
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

        const simulation = forceSimulation<SimNode>(simNodes)
            .force(
                'link',
                forceLink<SimNode, SimLink>(simLinks)
                    .id((node) => node.id)
                    .distance(120)
                    .strength(0.6),
            )
            .force('charge', forceManyBody().strength(-280))
            .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
            .force('collide', forceCollide(NODE_SIZE + 28))
            .force('x', forceX(WIDTH / 2).strength(0.05))
            .force('y', forceY(HEIGHT / 2).strength(0.05))
            .stop();

        for (let i = 0; i < 400; i += 1) simulation.tick();

        const graph = new Graph({ multi: true, type: 'directed' });

        for (const node of simNodes) {
            graph.addNode(node.id, {
                color: nodeColor,
                label: node.title,
                size: NODE_SIZE,
                x: node.x ?? 0,
                y: node.y ?? 0,
            });
        }

        for (const link of simLinks) {
            graph.addEdge(link.sourceId, link.targetId, {
                color: SYNAPSE_COLORS[link.kind as SynapseKind][isDark ? 'dark' : 'light'],
                kind: link.kind,
                size: 2,
            });
        }

        const sigmaInstance = new Sigma(graph, containerEl, {
            settings: {
                labelRenderedSizeThreshold: 0,
                renderLabels: true,
            },
            styles: {
                edges: DEFAULT_STYLES.edges,
                nodes: {
                    ...DEFAULT_STYLES.nodes,
                    labelColor: {
                        else: { attribute: 'color' },
                        then: '#000000',
                        whenState: 'isHovered',
                    },
                },
            },
        });

        sigmaInstance.on('clickNode', ({ node }) => {
            void goto(resolve('/neurons/[id]', { id: node }));
        });

        const handleResize = () => sigmaInstance.resize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            sigmaInstance.kill();
        };
    });
</script>

<div class="flex flex-col gap-4 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">Graph</h1>
        <Button href={resolve('/neurons')} variant="outline">Back to neurons</Button>
    </header>

    <div class="relative h-[80dvh] min-h-125 w-full overflow-hidden rounded-sm border">
        <div bind:this={containerEl} class="h-full w-full"></div>

        <div
            class="absolute bottom-4 left-4 flex flex-wrap gap-x-4 gap-y-1.5 rounded-sm border bg-popover/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
        >
            {#each SYNAPSE_KINDS as kind (kind)}
                <span class="flex items-center gap-1.5">
                    <span
                        class="inline-block h-0.5 w-4"
                        style={`background-color: ${SYNAPSE_COLORS[kind][mode.current === 'dark' ? 'dark' : 'light']}`}
                    ></span>
                    {kind}
                </span>
            {/each}
        </div>
    </div>
</div>
