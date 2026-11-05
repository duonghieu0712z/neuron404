<script lang="ts">
    import type { PageProps } from './$types';

    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { SvelteURLSearchParams } from 'svelte/reactivity';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';
    import { Input } from '#lib/components/ui/input';
    import { Label } from '#lib/components/ui/label';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { data }: PageProps = $props();

    const panel = getNeuronPanelContext();

    let searchValue = $state(data.query);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function handleSearchInput(event: Event) {
        searchValue = (event.currentTarget as HTMLInputElement).value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const params = new SvelteURLSearchParams();
            if (searchValue) params.set('q', searchValue);
            const query = params.toString();
            void goto(`${resolve('/neurons')}${query ? `?${query}` : ''}`, {
                replace: true,
                reset: false,
            });
        }, 300);
    }

    function handleClick(event: MouseEvent, id: string) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        void panel.open(id);
    }
</script>

<svelte:head>
    <title>Neurons · neuron404</title>
</svelte:head>

<section class="w-full space-y-6 p-6">
    <h1 class="sr-only">Neurons</h1>

    <div class="max-w-sm">
        <Label for="q" class="sr-only">Search neurons</Label>
        <Input
            id="q"
            type="search"
            value={searchValue}
            oninput={handleSearchInput}
            placeholder="Search neurons..."
        />
    </div>

    {#if data.neurons.length === 0}
        <div class="flex flex-col items-start gap-3 rounded-sm border border-dashed p-8">
            {#if data.query}
                <p class="text-sm text-muted-foreground">No results for "{data.query}".</p>
                <Button href={resolve('/neurons')} variant="outline">Clear search</Button>
            {:else}
                <p class="text-sm text-muted-foreground">No neurons yet.</p>
                <Button href={resolve('/neurons/new')}>New neuron</Button>
            {/if}
        </div>
    {:else}
        <div
            class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] items-start gap-4"
        >
            {#each data.neurons as neuron (neuron.id)}
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
                                variant={neuron.status === 'published' ? 'default' : 'outline'}
                                class="shrink-0"
                            >
                                {neuron.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent class="space-y-2">
                        <p class="line-clamp-2 text-sm text-muted-foreground">{neuron.body}</p>
                        <p class="truncate text-xs text-muted-foreground">
                            {neuron.grounding} · {neuron.endorsement} · {neuron.provenance}
                        </p>
                    </CardContent>
                </Card>
            {/each}
        </div>
    {/if}
</section>
