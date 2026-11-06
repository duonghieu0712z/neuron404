<script lang="ts">
    import type { RegionOverview } from '#lib/server/neuron/region-overview';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';

    let {
        data,
        onSelectNeuron,
    }: {
        data: RegionOverview;
        onSelectNeuron: (id: string) => void;
    } = $props();

    const blocks = $derived(data.body.split(/\n\s*\n/).filter(Boolean));

    function inline(text: string) {
        const parts: { text: string; id?: string }[] = [];
        let offset = 0;
        for (const match of text.matchAll(/\[([^\]]+)\]\(neuron:([a-zA-Z0-9_-]+)\)/g)) {
            parts.push({ text: text.slice(offset, match.index) });
            parts.push({ text: match[1], id: match[2] });
            offset = match.index + match[0].length;
        }
        parts.push({ text: text.slice(offset) });
        return parts;
    }
</script>

<article class="space-y-6">
    <header class="space-y-3">
        <div class="flex flex-wrap gap-2">
            <Badge variant="outline">Region overview</Badge>
            <Badge variant="secondary">{data.neurons.length} neurons</Badge>
            {#if data.stale}<Badge variant="outline">Knowledge has changed</Badge>{/if}
        </div>
        <h1 class="text-xl font-semibold">{data.region.title}</h1>
        {#if data.stale}
            <p class="text-xs leading-relaxed text-muted-foreground">
                Some supporting knowledge has changed since this overview was written.
            </p>
        {/if}
    </header>
    <div class="space-y-4 text-sm leading-relaxed">
        {#each blocks as block, index (index)}
            {#if /^#{1,3}\s/.test(block)}
                <h2 class="pt-2 text-base font-semibold">{block.replace(/^#{1,3}\s+/, '')}</h2>
            {:else}
                <p class="whitespace-pre-line">
                    {#each inline(block) as part, partIndex (partIndex)}
                        {#if part.id}
                            <Button
                                variant="link"
                                class="inline h-auto p-0 text-left text-sm whitespace-normal"
                                onclick={() => onSelectNeuron(part.id!)}
                            >
                                {part.text}
                            </Button>
                        {:else}{part.text}{/if}
                    {/each}
                </p>
            {/if}
        {:else}
            <p class="text-muted-foreground">No overview has been written for this Region yet.</p>
        {/each}
    </div>
    <section class="space-y-3 border-t pt-4">
        <h2 class="text-sm font-semibold">Explore this region</h2>
        <div class="space-y-1">
            {#each data.neurons as neuron (neuron.id)}
                <Button
                    variant="ghost"
                    class="h-auto w-full justify-start px-2 py-2 text-left text-sm whitespace-normal"
                    onclick={() => onSelectNeuron(neuron.id)}
                >
                    {neuron.title}
                </Button>
            {/each}
        </div>
    </section>
</article>
