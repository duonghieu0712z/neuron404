<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Button } from '#lib/components/ui/button';
    import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
    } from '#lib/components/ui/card';

    let { data }: PageProps = $props();
</script>

<article class="mx-auto max-w-3xl space-y-6 p-6">
    <Button href={resolve('/neurons')} variant="link" class="px-0 text-muted-foreground">
        &larr; All neurons
    </Button>

    <Card>
        <CardHeader>
            <CardTitle class="text-2xl">{data.neuron.title}</CardTitle>
            <CardDescription>
                {data.neuron.status} · grounding: {data.neuron.grounding} · endorsement: {data
                    .neuron.endorsement} · provenance:
                {data.neuron.provenance}
            </CardDescription>
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
