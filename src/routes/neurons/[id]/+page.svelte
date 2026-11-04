<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';

    let { data }: PageProps = $props();
</script>

<article class="mx-auto max-w-3xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">{data.neuron.title}</h1>
        <Button href={resolve('/neurons')} variant="outline">Back to neurons</Button>
    </header>

    <Card>
        <CardHeader>
            <div class="flex flex-wrap gap-1.5">
                <Badge variant="outline">{data.neuron.status}</Badge>
                <Badge variant="outline">grounding: {data.neuron.grounding}</Badge>
                <Badge variant="outline">endorsement: {data.neuron.endorsement}</Badge>
                <Badge variant="outline">provenance: {data.neuron.provenance}</Badge>
            </div>
        </CardHeader>
        <CardContent>
            <div class="text-sm whitespace-pre-wrap">{data.neuron.body}</div>
        </CardContent>
    </Card>

    {#if data.outgoing.length > 0}
        <Card>
            <CardHeader>
                <CardTitle class="text-sm text-muted-foreground uppercase"
                    >Outgoing synapses</CardTitle
                >
            </CardHeader>
            <CardContent>
                <ul class="space-y-1">
                    {#each data.outgoing as synapse (synapse.id)}
                        <li class="text-sm">
                            <span class="text-muted-foreground">{synapse.kind}</span>
                            <a
                                href={resolve('/neurons/[id]', { id: synapse.target.id })}
                                class="font-medium hover:underline"
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
        <Card>
            <CardHeader>
                <CardTitle class="text-sm text-muted-foreground uppercase"
                    >Incoming synapses</CardTitle
                >
            </CardHeader>
            <CardContent>
                <ul class="space-y-1">
                    {#each data.incoming as synapse (synapse.id)}
                        <li class="text-sm">
                            <a
                                href={resolve('/neurons/[id]', { id: synapse.source.id })}
                                class="font-medium hover:underline"
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
</article>
