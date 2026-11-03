<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Button } from '#lib/components/ui/button';
    import { Card, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card';
    import { Input } from '#lib/components/ui/input';

    let { data }: PageProps = $props();
</script>

<section class="mx-auto max-w-3xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">Neurons</h1>
        <div class="flex gap-2">
            <Button href={resolve('/neurons/graph')} variant="outline">Graph</Button>
            <Button href={resolve('/neurons/lint')} variant="outline">Lint / Verify</Button>
            <Button href={resolve('/neurons/new')}>New neuron</Button>
        </div>
    </header>

    <form method="get" class="flex gap-2">
        <Input type="search" name="q" value={data.query} placeholder="Search neurons..." />
        <Button type="submit" variant="outline">Search</Button>
    </form>

    {#if data.neurons.length === 0}
        <p class="text-sm text-muted-foreground">No neurons yet.</p>
    {:else}
        <div class="space-y-3">
            {#each data.neurons as neuron (neuron.id)}
                <Card>
                    <CardHeader>
                        <CardTitle>
                            <a
                                href={resolve('/neurons/[id]', { id: neuron.id })}
                                class="hover:underline"
                            >
                                {neuron.title}
                            </a>
                        </CardTitle>
                        <CardDescription>
                            {neuron.status} · grounding: {neuron.grounding} · endorsement: {neuron.endorsement}
                            · provenance:
                            {neuron.provenance}
                        </CardDescription>
                    </CardHeader>
                </Card>
            {/each}
        </div>
    {/if}
</section>
