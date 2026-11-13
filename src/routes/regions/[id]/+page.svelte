<script lang="ts">
    import type { PageProps } from './$types';

    import ReadingPathEditor from '#lib/components/neuron/reading-path-editor.svelte';
    import RegionOverview from '#lib/components/neuron/region-overview.svelte';
    import { Button } from '#lib/components/ui/button';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { data, form }: PageProps = $props();

    const panel = getNeuronPanelContext();

    let editing = $state(false);

    const steps = $derived(
        data.readingPath.steps.flatMap((step) => {
            const member = data.overview.neurons.find((neuron) => neuron.id === step.id);

            return member ? [{ ...step, title: member.title }] : [];
        }),
    );
</script>

<svelte:head><title>{data.overview.region.title} · neuron404</title></svelte:head>

<section class="mx-auto max-w-4xl space-y-8 p-6" data-neuron-trigger>
    <RegionOverview data={data.overview} onSelectNeuron={panel.open} showReadingLink={false} />

    <section class="space-y-4" aria-label="Reading path">
        <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">Reading path</h2>
            <Button
                variant="outline"
                size="sm"
                onclick={() => {
                    editing = !editing;
                }}
            >
                {editing ? 'Close editor' : 'Edit reading path'}
            </Button>
        </div>

        {#if form?.message}
            <p role="alert" class="text-sm">{form.message}</p>
        {/if}

        {#if form?.saved}
            <p role="status" class="text-sm">Reading path saved.</p>
        {/if}

        {#if editing}
            <ReadingPathEditor path={data.readingPath} members={data.overview.neurons} />
        {:else}
            {#if data.readingPath.introduction}
                <p class="text-sm leading-relaxed whitespace-pre-wrap">
                    {data.readingPath.introduction}
                </p>
            {/if}

            {#if steps.length !== data.readingPath.steps.length}
                <p class="text-sm text-muted-foreground">
                    Some steps are unavailable because their neurons were removed or moved out of
                    this region.
                </p>
            {/if}

            {#if steps.length}
                <ol class="space-y-3">
                    {#each steps as step, index (step.id)}
                        <li class="rounded-sm border p-4">
                            <Button
                                variant="link"
                                class="h-auto p-0 text-left whitespace-normal"
                                onclick={() =>
                                    panel.startReading(
                                        {
                                            regionId: data.overview.region.id,
                                            title: data.overview.region.title,
                                            steps,
                                        },
                                        index,
                                    )}
                            >
                                {index + 1}. {step.title}
                            </Button>
                            {#if step.purpose}
                                <p class="mt-2 text-sm text-muted-foreground">
                                    {step.purpose}
                                </p>
                            {/if}
                        </li>
                    {/each}
                </ol>
            {:else}
                <p class="text-sm text-muted-foreground">
                    No reading path has been curated for this region yet.
                </p>
            {/if}
        {/if}
    </section>
</section>
