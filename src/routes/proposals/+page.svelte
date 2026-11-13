<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';

    let { data }: PageProps = $props();

    let showResolved = $state(false);

    const proposals = $derived(
        data.proposals.filter(
            (item) =>
                showResolved ||
                item.proposal.status === 'pending' ||
                item.proposal.status === 'applying',
        ),
    );
</script>

<svelte:head><title>Proposals · neuron404</title></svelte:head>

<section class="mx-auto max-w-5xl space-y-6 p-6">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Proposed changes</h1>
        <Button
            variant="outline"
            size="sm"
            onclick={() => {
                showResolved = !showResolved;
            }}
        >
            {showResolved ? 'Pending only' : 'Include resolved'}
        </Button>
    </div>
    <p class="text-sm text-muted-foreground">
        Review proposed content, sources and synapses before applying them to the current knowledge.
    </p>

    {#if !proposals.length}
        <p class="text-sm text-muted-foreground">No proposals to review.</p>
    {/if}

    {#each proposals as item (item.proposal.id)}
        <article class="space-y-3 rounded-sm border p-4">
            <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-medium">
                    <a
                        href={resolve('/proposals/[id]', { id: item.proposal.id })}
                        class="hover:underline"
                    >
                        {item.proposal.base.title}
                    </a>
                </h2>
                <Badge variant="outline">
                    {item.proposal.status}
                </Badge>
                {#if item.stale && item.proposal.status === 'pending'}
                    <Badge variant="outline">Neuron has changed</Badge>
                {/if}
            </div>
            <p class="text-sm whitespace-pre-wrap">{item.proposal.reason}</p>
            <p class="text-xs text-muted-foreground">
                {item.proposal.author} · {item.proposal.created} · {item.changes.length} changes
            </p>
        </article>
    {/each}
</section>
