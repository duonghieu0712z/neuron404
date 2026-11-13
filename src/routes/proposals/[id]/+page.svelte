<script lang="ts">
    import type { PageProps } from './$types';

    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';

    import ProposalChange from '#lib/components/proposal/proposal-change.svelte';
    import { Button } from '#lib/components/ui/button';

    let { data, form }: PageProps = $props();

    let selected = $derived<Record<string, boolean>>(
        Object.fromEntries(
            data.changes.map((change) => [
                change.id,
                data.proposal.resolution?.accepted.includes(change.id) ?? false,
            ]),
        ),
    );

    let submitting = $state(false);

    const pending = $derived(
        data.proposal.status === 'pending' || data.proposal.status === 'applying',
    );
    const accepted = $derived(
        data.changes.filter((change) => selected[change.id]).map((change) => change.id),
    );
</script>

<svelte:head><title>Review proposal · neuron404</title></svelte:head>

<section class="mx-auto max-w-6xl space-y-6 p-6" data-neuron-trigger>
    <Button href={resolve('/proposals')} variant="link" class="p-0">All proposals</Button>
    <Button
        href={resolve('/neurons/[id]', { id: data.proposal.neuronId })}
        variant="outline"
        size="sm"
    >
        Read current neuron
    </Button>

    <h1 class="text-xl font-semibold">{data.proposal.base.title}</h1>
    <p class="text-sm whitespace-pre-wrap">{data.proposal.reason}</p>
    <p class="text-xs text-muted-foreground">
        {data.proposal.author} · {data.proposal.created} · {data.proposal.status}
    </p>

    {#if data.stale && pending}
        <p role="alert" class="text-sm">
            The neuron has changed. This proposal can be rejected, but its changes cannot be
            applied. Create a new proposal from the current version.
        </p>
    {/if}

    {#if form?.message}
        <p role="alert" class="text-sm">{form.message}</p>
    {/if}

    {#if form?.resolved}
        <p role="status" class="text-sm">Review saved.</p>
    {/if}

    <form
        method="post"
        class="space-y-4"
        use:enhance={() => {
            submitting = true;

            return async ({ update }) => {
                try {
                    await update({ reset: false });
                } finally {
                    submitting = false;
                }
            };
        }}
    >
        <input type="hidden" name="revision" value={data.revision} />

        {#each accepted as id (id)}
            <input type="hidden" name="accepted" value={id} />
        {/each}

        {#each data.changes as change (change.id)}
            <ProposalChange
                {change}
                sources={data.sources}
                neurons={data.neurons}
                bind:selected={selected[change.id]}
                disabled={!pending || submitting || data.stale}
            />
        {/each}

        {#if pending}
            <div class="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    disabled={submitting || data.stale}
                    onclick={() => {
                        selected = Object.fromEntries(
                            data.changes.map((change) => [change.id, true]),
                        );
                    }}
                >
                    Accept all
                </Button><Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onclick={() => {
                        selected = {};
                    }}
                >
                    Reject all
                </Button>
            </div>
            <p class="text-sm text-muted-foreground">
                {accepted.length} accepted, {data.changes.length - accepted.length} rejected. Saving resolves
                this proposal; rejected changes will not be applied.
            </p>
            <Button type="submit" disabled={submitting || (data.stale && accepted.length > 0)}>
                {submitting ? 'Saving…' : 'Save review'}
            </Button>
        {/if}
    </form>
</section>
