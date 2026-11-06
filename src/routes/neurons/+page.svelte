<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { data }: PageProps = $props();

    const panel = getNeuronPanelContext();

    function handleClick(event: MouseEvent, id: string) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
            return;
        }
        event.preventDefault();
        void panel.open(id);
    }
</script>

<svelte:head>
    <title>Neurons · neuron404</title>
</svelte:head>

<section class="w-full space-y-8 p-6" data-neuron-surface>
    <h1 class="sr-only">Neurons</h1>

    {#if data.groups.length === 0}
        {#if data.query}
            <p class="text-sm text-muted-foreground">No results for "{data.query}".</p>
        {:else}
            <div class="flex flex-col items-start gap-3 rounded-sm border border-dashed p-8">
                <p class="text-sm text-muted-foreground">No neurons yet.</p>
                <Button href={resolve('/neurons/new')}>New neuron</Button>
            </div>
        {/if}
    {:else}
        {#each data.groups as group (group.id)}
            <section class="space-y-4" aria-labelledby={`region-${group.id}`}>
                <div class="flex items-baseline gap-2">
                    <h2 id={`region-${group.id}`} class="text-sm font-semibold">{group.title}</h2>
                    <span
                        class="text-xs text-muted-foreground tabular-nums"
                        aria-label={`${group.neurons.length} neurons`}
                    >
                        {group.neurons.length}
                    </span>
                </div>
                <div
                    class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] items-start gap-4"
                >
                    {#each group.neurons as neuron (neuron.id)}
                        <Card
                            class="w-full max-w-96 min-w-0 cursor-pointer"
                            data-neuron-trigger
                            onclick={(event) => handleClick(event, neuron.id)}
                        >
                            <CardHeader class="gap-1.5">
                                <div class="flex min-w-0 items-center justify-between gap-2">
                                    <CardTitle class="min-w-0 truncate">
                                        <a href={resolve('/neurons/[id]', { id: neuron.id })}>
                                            {neuron.title}
                                        </a>
                                    </CardTitle>
                                    <Badge
                                        variant={neuron.status === 'published'
                                            ? 'default'
                                            : 'outline'}
                                        class="shrink-0"
                                    >
                                        {neuron.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent class="space-y-2">
                                <p class="line-clamp-2 text-sm text-muted-foreground">
                                    {neuron.body}
                                </p>
                                <p class="truncate text-xs text-muted-foreground">
                                    {neuron.grounding} · {neuron.endorsement} · {neuron.provenance}
                                </p>
                            </CardContent>
                        </Card>
                    {/each}
                </div>
            </section>
        {/each}
    {/if}
</section>
