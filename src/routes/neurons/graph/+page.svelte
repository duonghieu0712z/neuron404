<script lang="ts">
    import type { PageProps } from './$types';
    import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

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

    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent } from '#lib/components/ui/card';
    import { SYNAPSE_KINDS } from '#lib/neuron/schema';

    let { data }: PageProps = $props();

    const WIDTH = 900;
    const HEIGHT = 620;
    const NODE_RADIUS = 7;

    interface SimNode extends SimulationNodeDatum {
        id: string;
        title: string;
    }

    interface SimLink extends SimulationLinkDatum<SimNode> {
        kind: string;
        sourceId: string;
        targetId: string;
    }

    interface PositionedNode {
        id: string;
        title: string;
        x: number;
        y: number;
    }

    interface PositionedEdge {
        kind: string;
        source: string;
        target: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }

    let graphNodes = $state<PositionedNode[]>([]);
    let graphEdges = $state<PositionedEdge[]>([]);

    $effect(() => {
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
                source: edge.source,
                target: edge.target,
                kind: edge.kind,
                sourceId: edge.source,
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
            .force('collide', forceCollide(NODE_RADIUS + 28))
            .force('x', forceX(WIDTH / 2).strength(0.05))
            .force('y', forceY(HEIGHT / 2).strength(0.05))
            .stop();

        for (let i = 0; i < 400; i += 1) simulation.tick();

        const positionById = new Map(
            simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
        );

        graphNodes = simNodes.map((node) => ({
            id: node.id,
            title: node.title,
            x: node.x ?? 0,
            y: node.y ?? 0,
        }));

        graphEdges = simLinks
            .map((edge) => {
                const from = positionById.get(edge.sourceId);
                const to = positionById.get(edge.targetId);
                if (!from || !to) return null;

                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.hypot(dx, dy) || 1;
                const ux = dx / length;
                const uy = dy / length;

                return {
                    kind: edge.kind,
                    source: edge.sourceId,
                    target: edge.targetId,
                    x1: from.x + ux * NODE_RADIUS,
                    y1: from.y + uy * NODE_RADIUS,
                    x2: to.x - ux * (NODE_RADIUS + 6),
                    y2: to.y - uy * (NODE_RADIUS + 6),
                };
            })
            .filter((edge): edge is PositionedEdge => edge !== null);
    });

    function truncate(title: string, max = 22): string {
        return title.length > max ? `${title.slice(0, max - 1)}…` : title;
    }

    const LABEL_WIDTH = 170;
    const PADDING = 50;

    let viewBox = $derived.by(() => {
        if (graphNodes.length === 0) return `0 0 ${WIDTH} ${HEIGHT}`;

        const xs = graphNodes.map((node) => node.x);
        const ys = graphNodes.map((node) => node.y);
        const minX = Math.min(...xs) - PADDING;
        const maxX = Math.max(...xs) + PADDING + LABEL_WIDTH;
        const minY = Math.min(...ys) - PADDING;
        const maxY = Math.max(...ys) + PADDING;

        return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
    });
</script>

<section class="mx-auto max-w-5xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">Graph</h1>
        <Button href={resolve('/neurons')} variant="outline">Back to neurons</Button>
    </header>

    <div class="graph-root space-y-4">
        <Card>
            <CardContent>
                <svg {viewBox} class="h-auto w-full" role="img" aria-label="Neuron synapse graph">
                    <defs>
                        {#each SYNAPSE_KINDS as kind (kind)}
                            <marker
                                id={`arrow-${kind}`}
                                viewBox="0 0 10 10"
                                refX="9"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path
                                    d="M0,0 L10,5 L0,10 Z"
                                    style={`fill: var(--synapse-${kind})`}
                                />
                            </marker>
                        {/each}
                    </defs>

                    {#each graphEdges as edge (edge.source + edge.target + edge.kind)}
                        <line
                            x1={edge.x1}
                            y1={edge.y1}
                            x2={edge.x2}
                            y2={edge.y2}
                            stroke-width="2"
                            stroke-linecap="round"
                            marker-end={`url(#arrow-${edge.kind})`}
                            style={`stroke: var(--synapse-${edge.kind})`}
                        >
                            <title>{edge.kind}</title>
                        </line>
                    {/each}

                    {#each graphNodes as node (node.id)}
                        <a href={resolve('/neurons/[id]', { id: node.id })}>
                            <title>{node.title}</title>
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={NODE_RADIUS + 9}
                                fill="transparent"
                            />
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={NODE_RADIUS}
                                class="fill-foreground"
                            />
                            <text
                                x={node.x + NODE_RADIUS + 5}
                                y={node.y + 4}
                                class="fill-foreground text-[11px]"
                            >
                                {truncate(node.title)}
                            </text>
                        </a>
                    {/each}
                </svg>
            </CardContent>
        </Card>

        <div class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {#each SYNAPSE_KINDS as kind (kind)}
                <span class="flex items-center gap-1.5">
                    <span
                        class="inline-block h-0.5 w-4"
                        style={`background-color: var(--synapse-${kind})`}
                    ></span>
                    {kind}
                </span>
            {/each}
        </div>
    </div>
</section>

<style>
    .graph-root {
        --synapse-supports: #2a78d6;
        --synapse-contradicts: #eb6834;
        --synapse-extends: #1baf7a;
        --synapse-cites: #eda100;
        --synapse-questions: #e87ba4;
    }

    :global(.dark) .graph-root {
        --synapse-supports: #3987e5;
        --synapse-contradicts: #d95926;
        --synapse-extends: #199e70;
        --synapse-cites: #c98500;
        --synapse-questions: #d55181;
    }
</style>
