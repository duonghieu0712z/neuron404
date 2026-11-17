<script lang="ts">
    import type { NeuronDetail } from '#lib/server/neuron/get-detail';

    import { resolve } from '$app/paths';

    import DetailSection from '#lib/components/neuron/detail-section.svelte';

    let { data }: { data: NeuronDetail } = $props();
</script>

<DetailSection title="Knowledge maintenance" open={false}>
    <div class="space-y-3 text-xs leading-relaxed">
        {#if !data.reviewStatus.enabled}
            <p>LLM review is inactive: no provider is configured.</p>
        {:else}
            <p>
                {data.reviewStatus.pending} jobs waiting; {data.reviewStatus.remainingRequests} model
                calls available in the current hourly window.
            </p>
        {/if}
        {#each data.reviewStatus.coverage as coverage (coverage.neuron)}
            <p>
                Review coverage: {coverage.status}; {coverage.completedParts}/{coverage.parts} scopes
                completed for the current revision.
            </p>
        {/each}
        {#each data.reviewStatus.jobs.filter((job) => job.error) as job (job.key)}
            <p>{job.status}: {job.error}</p>
        {/each}
        {#each data.sourceChecks as check (check.id)}
            <p>
                Source check: {String(check.payload.status)} · {check.at.slice(0, 10)}
                {String(check.payload.reason ?? '')}
            </p>
        {/each}
        {#each data.disputes as dispute (dispute.id)}
            <section class="space-y-2 border-t pt-2">
                <p>Issue: {dispute.status}{dispute.incomplete ? ' · Context incomplete' : ''}</p>
                {#each dispute.events as event (event.id)}
                    <p>{event.at.slice(0, 10)} · {String(event.payload.note)}</p>
                    {#each Array.isArray(event.payload.evidence) ? (event.payload.evidence as { quote: string }[]) : [] as evidence, index (index)}
                        <blockquote class="border-l-2 pl-2 text-muted-foreground">
                            {evidence.quote}
                        </blockquote>
                    {/each}
                {/each}
            </section>
        {/each}
        {#each data.repairs as repair (repair.id)}
            <p>
                Latest action: {String(repair.payload.phase)} · {String(
                    repair.payload.reason ?? '',
                )}
                {#if typeof repair.payload.proposal === 'string'}
                    <a
                        class="underline"
                        href={resolve('/proposals/[id]', { id: repair.payload.proposal })}
                    >
                        View proposal
                    </a>
                {/if}
            </p>
        {/each}
    </div>
</DetailSection>
