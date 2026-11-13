<script lang="ts">
    import type { RegionOverview } from '#lib/server/neuron/region-overview';

    import { resolve } from '$app/paths';

    import MarkdownContent from '#lib/components/markdown/markdown-content.svelte';
    import DetailSection from '#lib/components/neuron/detail-section.svelte';
    import KnowledgeReview from '#lib/components/review/knowledge-review.svelte';
    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';

    let {
        data,
        onSelectNeuron,
        showReadingLink = true,
    }: {
        data: RegionOverview;
        showReadingLink?: boolean;
        onSelectNeuron: (id: string) => void;
    } = $props();
</script>

<article class="space-y-6">
    <header class="space-y-3">
        <div class="flex flex-wrap gap-2">
            <Badge variant="outline">Region overview</Badge>
            <Badge variant="secondary">{data.neurons.length} neurons</Badge>

            {#if data.stale}
                <Badge variant="outline">Knowledge has changed</Badge>
            {/if}
        </div>
        <h1 class="text-xl font-semibold">{data.region.title}</h1>

        {#if showReadingLink}
            <Button
                variant="link"
                class="h-auto p-0"
                href={resolve('/regions/[id]', { id: data.region.id })}
            >
                Open region and reading path
            </Button>
        {/if}

        {#if data.stale}
            <p class="text-xs leading-relaxed text-muted-foreground">
                Some supporting knowledge has changed since this overview was written.
            </p>
        {/if}
    </header>

    {#if data.body}
        <MarkdownContent content={data.body} {onSelectNeuron} />
    {:else}
        <p class="text-sm text-muted-foreground">
            No overview has been written for this Region yet.
        </p>
    {/if}
    <KnowledgeReview reports={data.reviews} {onSelectNeuron} />
    <DetailSection title="Explore this region" count={data.neurons.length} open={false}>
        <div class="space-y-1">
            {#each data.neurons as neuron (neuron.id)}
                <Button
                    variant="ghost"
                    class="h-auto w-full justify-start px-2 py-2 text-left text-sm whitespace-normal underline-offset-4 hover:underline"
                    onclick={() => onSelectNeuron(neuron.id)}
                >
                    {neuron.title}
                </Button>
            {/each}
        </div>
    </DetailSection>
</article>
