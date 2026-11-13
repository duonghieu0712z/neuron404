<script lang="ts">
    import type { NeuronDetail } from '#lib/server/neuron/get-detail';

    import { resolve } from '$app/paths';

    import MarkdownContent from '#lib/components/markdown/markdown-content.svelte';
    import DetailSection from '#lib/components/neuron/detail-section.svelte';
    import KnowledgeReview from '#lib/components/review/knowledge-review.svelte';
    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';
    import { webHref } from '#lib/links';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let {
        data,
        layout = 'full',
        onSelectNeuron,
    }: {
        data: NeuronDetail;
        layout?: 'full' | 'panel';
        onSelectNeuron?: (id: string) => void;
    } = $props();

    const panel = getNeuronPanelContext();

    function handleSynapseClick(event: MouseEvent, id: string) {
        if (!onSelectNeuron) {
            return;
        }

        event.preventDefault();
        onSelectNeuron(id);
    }
</script>

{#snippet metadata()}
    <DetailSection title="Metadata" size={layout === 'panel' ? 'sm' : 'default'}>
        <div class="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">{data.neuron.status}</Badge>

            {#if data.neuron.lifecycle !== 'active'}
                <Badge variant="outline">{data.neuron.lifecycle}</Badge>
            {/if}
            <Badge variant="outline">grounding: {data.neuron.grounding}</Badge>
            <Badge variant="outline">endorsement: {data.neuron.endorsement}</Badge>
            <Badge variant="outline">provenance: {data.neuron.provenance}</Badge>
        </div>

        {#if data.regions.length > 0}
            <div class="flex flex-wrap gap-1.5 pt-2" aria-label="Regions">
                {#each data.regions as region (region.id)}
                    <Badge variant="secondary">{region.title}</Badge>
                {/each}
            </div>
        {/if}
    </DetailSection>
{/snippet}

{#snippet body()}
    <Card size={layout === 'panel' ? 'sm' : 'default'}>
        <CardContent>
            <MarkdownContent content={data.neuron.body} sources={data.sources} {onSelectNeuron} />
        </CardContent>
    </Card>
{/snippet}

{#snippet synapses()}
    <KnowledgeReview reports={data.reviews} {onSelectNeuron} />

    {#if data.neuron.supersededBy}
        <Card size={layout === 'panel' ? 'sm' : 'default'}>
            <CardHeader><CardTitle class="text-sm">Superseded</CardTitle></CardHeader>
            <CardContent>
                <a
                    href={resolve('/neurons/[id]', { id: data.neuron.supersededBy })}
                    class="text-sm hover:underline"
                    onclick={(event) => handleSynapseClick(event, data.neuron.supersededBy!)}
                >
                    Read the replacement neuron
                </a>
            </CardContent>
        </Card>
    {/if}

    {#if data.sources.length > 0}
        <DetailSection
            title="Sources"
            count={data.sources.length}
            size={layout === 'panel' ? 'sm' : 'default'}
            open={false}
        >
            <ul class="space-y-3 text-sm">
                {#each data.sources as entry (entry.id)}
                    {@const href = webHref(entry.source.uri)}
                    <li>
                        <Button
                            variant="link"
                            class="h-auto p-0 text-left whitespace-normal"
                            data-neuron-trigger
                            onclick={() => panel.openSource(entry.id)}
                        >
                            {entry.source.title}
                        </Button>

                        {#if href}
                            <!-- eslint-disable svelte/no-navigation-without-resolve -- webHref only permits absolute HTTP(S) URLs. -->
                            <a
                                {href}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-xs break-all text-muted-foreground underline underline-offset-4 hover:text-foreground"
                            >
                                {entry.source.uri}
                            </a>
                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                        {:else}
                            <p class="text-xs break-all text-muted-foreground">
                                {entry.source.uri}
                            </p>
                        {/if}

                        {#if entry.source.locator}
                            <p class="text-xs text-muted-foreground">
                                {entry.source.locator}
                            </p>
                        {/if}
                    </li>
                {/each}
            </ul>
        </DetailSection>
    {/if}

    {#if data.outgoing.length > 0}
        <DetailSection
            title="Outgoing synapses"
            count={data.outgoing.length}
            size={layout === 'panel' ? 'sm' : 'default'}
            open={true}
        >
            <ul class="space-y-1">
                {#each data.outgoing as synapse (synapse.id)}
                    <li class="text-sm">
                        <span class="text-muted-foreground">{synapse.kind}</span>
                        <a
                            href={resolve('/neurons/[id]', { id: synapse.target.id })}
                            class="font-medium hover:underline"
                            onclick={(event) => handleSynapseClick(event, synapse.target.id)}
                        >
                            {synapse.target.title}
                        </a>
                    </li>
                {/each}
            </ul>
        </DetailSection>
    {/if}

    {#if data.incoming.length > 0}
        <DetailSection
            title="Incoming synapses"
            count={data.incoming.length}
            size={layout === 'panel' ? 'sm' : 'default'}
            open={true}
        >
            <ul class="space-y-1">
                {#each data.incoming as synapse (synapse.id)}
                    <li class="text-sm">
                        <a
                            href={resolve('/neurons/[id]', { id: synapse.source.id })}
                            class="font-medium hover:underline"
                            onclick={(event) => handleSynapseClick(event, synapse.source.id)}
                        >
                            {synapse.source.title}
                        </a>
                        <span class="text-muted-foreground">{synapse.kind} this</span>
                    </li>
                {/each}
            </ul>
        </DetailSection>
    {/if}
{/snippet}

{#if layout === 'panel'}
    <div class="space-y-4">
        {@render metadata()}
        {@render body()}
        {@render synapses()}
    </div>
{:else}
    <div class="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        {@render body()}
        <aside class="space-y-6">
            {@render metadata()}
            {@render synapses()}
        </aside>
    </div>
{/if}
