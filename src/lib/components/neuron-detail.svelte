<script lang="ts">
    import type { NeuronDetail } from '#lib/server/neuron/get-detail';

    import { resolve } from '$app/paths';

    import { Badge } from '#lib/components/ui/badge';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';

    let {
        data,
        layout = 'full',
        onSelectNeuron,
    }: {
        data: NeuronDetail;
        layout?: 'full' | 'panel';
        onSelectNeuron?: (id: string) => void;
    } = $props();

    function handleSynapseClick(event: MouseEvent, id: string) {
        if (!onSelectNeuron) return;
        event.preventDefault();
        onSelectNeuron(id);
    }
</script>

{#snippet metadata()}
    <Card size={layout === 'panel' ? 'sm' : 'default'}>
        <CardHeader class="gap-1.5">
            <CardTitle class="text-sm text-muted-foreground uppercase">Metadata</CardTitle>
            <div class="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline">{data.neuron.status}</Badge>
                {#if data.neuron.lifecycle !== 'active'}
                    <Badge variant="outline">{data.neuron.lifecycle}</Badge>
                {/if}
                <Badge variant="outline">grounding: {data.neuron.grounding}</Badge>
                <Badge variant="outline">endorsement: {data.neuron.endorsement}</Badge>
                <Badge variant="outline">provenance: {data.neuron.provenance}</Badge>
            </div>
            {#if data.topics.length > 0}
                <div class="flex flex-wrap gap-1.5 pt-2" aria-label="Regions">
                    {#each data.topics as region (region.id)}
                        <Badge variant="secondary">{region.title}</Badge>
                    {/each}
                </div>
            {/if}
        </CardHeader>
    </Card>
{/snippet}

{#snippet body()}
    <Card size={layout === 'panel' ? 'sm' : 'default'}>
        <CardContent>
            <div class="text-sm whitespace-pre-wrap">{data.neuron.body}</div>
        </CardContent>
    </Card>
{/snippet}

{#snippet synapses()}
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
        <Card size={layout === 'panel' ? 'sm' : 'default'}>
            <CardHeader><CardTitle class="text-sm">Sources</CardTitle></CardHeader>
            <CardContent>
                <ul class="space-y-3 text-sm">
                    {#each data.sources as entry (entry.id)}
                        <li>
                            <p class="font-medium">{entry.source.title}</p>
                            <p class="text-xs break-all text-muted-foreground">
                                {entry.source.uri}
                            </p>
                            {#if entry.source.locator}<p class="text-xs text-muted-foreground">
                                    {entry.source.locator}
                                </p>{/if}
                        </li>
                    {/each}
                </ul>
            </CardContent>
        </Card>
    {/if}
    {#if data.outgoing.length > 0}
        <Card size={layout === 'panel' ? 'sm' : 'default'}>
            <CardHeader>
                <CardTitle class="text-sm text-muted-foreground uppercase">
                    Outgoing synapses
                </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
        </Card>
    {/if}

    {#if data.incoming.length > 0}
        <Card size={layout === 'panel' ? 'sm' : 'default'}>
            <CardHeader>
                <CardTitle class="text-sm text-muted-foreground uppercase">
                    Incoming synapses
                </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
        </Card>
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
