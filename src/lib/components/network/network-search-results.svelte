<script lang="ts">
    import type { NetworkFilters } from '#lib/network/filters';
    import type { NetworkData } from '#lib/network/types';

    import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
    import SearchIcon from '@lucide/svelte/icons/search';
    import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
    import XIcon from '@lucide/svelte/icons/x';

    import { Button } from '#lib/components/ui/button';
    import { Card } from '#lib/components/ui/card';
    import {
        Collapsible,
        CollapsibleContent,
        CollapsibleTrigger,
    } from '#lib/components/ui/collapsible';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { GROUNDING_COLORS } from '#lib/network/appearance';

    import NetworkFilterFields from './network-filter-fields.svelte';

    let {
        data,
        matches,
        filters = $bindable(),
        query,
        searching,
        selectedId,
        theme,
        onSelect,
    }: {
        data: NetworkData;
        matches: Set<string> | null;
        filters: NetworkFilters;
        query: string;
        searching: boolean;
        selectedId?: string;
        theme: 'dark' | 'light';
        onSelect: (id: string) => void;
    } = $props();

    let open = $state(false);
    let limit = $state(20);

    const nodeById = $derived(new Map(data.nodes.map((node) => [node.id, node])));
    const results = $derived(
        matches
            ? [...matches].flatMap((id) => {
                  const node = nodeById.get(id);

                  return node ? [node] : [];
              })
            : [],
    );

    const displayLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

    const chips = $derived(
        [
            {
                key: 'region' as const,
                label:
                    data.regions.find((region) => region.id === filters.region)?.title ??
                    filters.region,
            },
            { key: 'grounding' as const, label: displayLabel(filters.grounding) },
            { key: 'endorsement' as const, label: displayLabel(filters.endorsement) },
        ].filter((chip) => filters[chip.key]),
    );

    const active = $derived(!!query || chips.length > 0);
    const expanded = $derived(open || active);

    const heading = $derived.by(() => {
        if (query) {
            return `Results for “${query}”`;
        }

        return active ? 'Filtered neurons' : 'Filters';
    });

    $effect(() => {
        void matches;
        limit = 20;
    });
</script>

<Card
    size="sm"
    class={[
        'absolute top-4 right-4 max-h-[calc(100%-6rem)] max-w-[calc(100%-2rem)] gap-0 overflow-hidden bg-card/95 py-0 shadow-sm backdrop-blur-sm',
        expanded ? 'w-72' : 'w-auto',
    ]}
    data-neuron-trigger
>
    <Collapsible bind:open class="flex min-h-0 flex-col">
        <div class="flex min-h-8 shrink-0 items-center gap-2 p-1">
            {#if expanded}
                <div class="flex min-w-0 flex-1 items-center gap-2 pl-2 text-xs">
                    {#if active}
                        <SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
                    {/if}
                    <span class="min-w-0 truncate font-medium">
                        {heading}
                    </span>

                    {#if active}
                        <span class="shrink-0 text-muted-foreground tabular-nums" role="status">
                            {searching ? '…' : results.length}
                        </span>
                    {/if}
                </div>
            {/if}
            <CollapsibleTrigger>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant={open ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        class="relative size-7 shrink-0"
                        aria-label="Filters"
                        title="Filters"
                    >
                        <SlidersHorizontalIcon class="size-3.5" />

                        {#if chips.length && !open}
                            <span
                                class="absolute top-1 right-1 size-1 rounded-full bg-primary"
                            ></span>
                        {/if}
                    </Button>
                {/snippet}
            </CollapsibleTrigger>
        </div>
        <CollapsibleContent class="shrink-0 border-t">
            <NetworkFilterFields regions={data.regions} bind:filters />
        </CollapsibleContent>

        {#if chips.length}
            <div class="flex shrink-0 flex-wrap items-center gap-1 border-t px-2 py-2">
                {#each chips as chip (chip.key)}
                    <Button
                        variant="secondary"
                        size="sm"
                        class="h-5 max-w-full gap-1 rounded-sm px-1.5 text-[11px] font-normal"
                        aria-label={`Remove ${chip.key} filter: ${chip.label}`}
                        onclick={() => {
                            filters[chip.key] = '';
                        }}
                    >
                        <span class="truncate">{chip.label}</span>
                        <XIcon class="size-2.5 shrink-0 text-muted-foreground" />
                    </Button>
                {/each}

                {#if chips.length > 1}
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-5 px-1 text-[11px] text-muted-foreground"
                        onclick={() => {
                            filters = { region: '', grounding: '', endorsement: '' };
                        }}
                    >
                        Clear all
                    </Button>
                {/if}
            </div>
        {/if}

        {#if active}
            <ScrollArea
                class="network-search-scroll flex max-h-[min(45dvh,22rem)] min-h-0 flex-col border-t"
            >
                <ol class="space-y-0.5 p-1">
                    {#each results.slice(0, limit) as node (node.id)}
                        <li>
                            <Button
                                variant={selectedId === node.id ? 'secondary' : 'ghost'}
                                class="group h-auto w-full justify-start gap-2.5 px-2 py-2 text-left font-normal"
                                aria-pressed={selectedId === node.id}
                                onclick={() => onSelect(node.id)}
                            >
                                <span
                                    class="size-1.5 shrink-0 rounded-full"
                                    style:background-color={(GROUNDING_COLORS[node.grounding] ??
                                        GROUNDING_COLORS.assumption)[theme]}
                                ></span>
                                <span class="min-w-0 flex-1 space-y-0.5">
                                    <span class="block truncate text-xs leading-5">
                                        {node.title}
                                    </span>
                                    <span
                                        class="block truncate text-[11px] leading-4 text-muted-foreground"
                                    >
                                        {node.regions
                                            .map(
                                                (id) =>
                                                    data.regions.find((region) => region.id === id)
                                                        ?.title,
                                            )
                                            .filter(Boolean)
                                            .join(' · ') || 'Unfiled'}
                                    </span>
                                </span>
                                <ArrowUpRightIcon
                                    class="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                                />
                            </Button>
                        </li>
                    {/each}
                </ol>

                {#if searching && !results.length}
                    <p class="px-3 py-4 text-xs text-muted-foreground" role="status">Searching…</p>
                {:else if !results.length}
                    <p class="px-3 py-4 text-xs text-muted-foreground">No matching neurons.</p>
                {/if}

                {#if results.length > limit}
                    <Button
                        variant="ghost"
                        size="sm"
                        class="mx-1 mb-1 text-xs text-muted-foreground"
                        onclick={() => {
                            limit += 20;
                        }}
                    >
                        Show more
                    </Button>
                {/if}
            </ScrollArea>
        {/if}
    </Collapsible>
</Card>

<style>
    :global(.network-search-scroll > [data-slot='scroll-area-viewport']) {
        height: auto;
        min-height: 0;
        flex: 1;
    }
</style>
