<script lang="ts">
    import type { NetworkData, NetworkTheme } from '#lib/network/types';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent } from '#lib/components/ui/card';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { GROUNDING_COLORS, REGION_COLOR, SYNAPSE_COLORS } from '#lib/network/appearance';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';
    import { GROUNDING_LEVELS, SYNAPSE_KINDS } from '#lib/neuron/schema';

    import LegendRow from './legend-row.svelte';
    import NetworkSection from './network-section.svelte';

    let {
        data,
        theme,
        overviewOpen = $bindable(),
        sections = $bindable(),
        focusedNode,
        focusedRegion,
        connectionCount,
        selectedRegionId,
    }: {
        data: NetworkData;
        theme: NetworkTheme;
        overviewOpen: boolean;
        sections: {
            regions: boolean;
            legend: boolean;
            shape: boolean;
            nodeColor: boolean;
            stroke: boolean;
            edgeColor: boolean;
        };
        focusedNode: NetworkData['nodes'][number] | undefined;
        focusedRegion: NetworkData['regions'][number] | undefined;
        connectionCount: number;
        selectedRegionId: string | null;
    } = $props();

    const panel = getNeuronPanelContext();

    function displayLabel(value: string) {
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    const networkSummary = $derived(
        [
            ...(!overviewOpen ? [`${data.regions.length} regions`] : []),
            `${data.nodes.length} neurons`,
            `${data.edges.length} synapses`,
        ].join(' · '),
    );

    const membershipCount = $derived(
        data.regions.reduce((count, region) => count + region.nodeIds.length, 0),
    );

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
</script>

{#snippet legendRow(
    label: string,
    count: number,
    shape: 'circle' | 'hexagon' | 'line' | 'dashed',
    color = 'currentColor',
)}
    <LegendRow {label} {count} {shape} {color} />
{/snippet}

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
                {networkSummary}
            </span>
        {/snippet}
        <CardContent class="flex min-h-0 flex-col gap-2 px-2 pb-3">
            <NetworkSection
                title="Regions"
                count={data.regions.length}
                bind:open={sections.regions}
                class={sections.regions && data.regions.length > 0
                    ? 'flex min-h-20 shrink-9999 flex-col'
                    : 'shrink-0'}
                contentClass="flex min-h-0 flex-col"
            >
                {#if data.regions.length > 0}
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
                {/if}
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
                                    {@render legendRow('Neuron', data.nodes.length, 'circle')}
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
                                            displayLabel(grounding),
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
                                        data.edges.length,
                                        'line',
                                    )}
                                    {@render legendRow(
                                        'Dashed · region membership',
                                        membershipCount,
                                        'dashed',
                                        REGION_COLOR[theme],
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
                                            displayLabel(kind),
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
                        {displayLabel(focusedNode.grounding)} · {connectionCount} synapses
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

<style>
    :global(.network-panel-scroll > [data-slot='scroll-area-viewport']) {
        height: auto;
        min-height: 0;
        flex: 1;
    }
</style>
