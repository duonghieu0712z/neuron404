<script lang="ts">
    import type { ProposalChange } from '#lib/proposals/changes';

    import { Button } from '#lib/components/ui/button';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let {
        change,
        sources,
        neurons,
        selected = $bindable(),
        disabled = false,
    }: {
        change: ProposalChange;
        sources: Record<string, { title: string; uri: string }>;
        neurons: Record<string, string>;
        selected: boolean;
        disabled?: boolean;
    } = $props();

    const panel = getNeuronPanelContext();

    function sourceId(text: string) {
        try {
            const value = JSON.parse(text);

            return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
        } catch {
            return null;
        }
    }
</script>

<article class="space-y-3 rounded-sm border p-4">
    <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">{change.field}</h2>
        <Button
            type="button"
            variant={selected ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={selected}
            {disabled}
            onclick={() => {
                selected = !selected;
            }}
        >
            {selected ? 'Accept' : 'Reject'}
        </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
        {#each [{ label: 'Base version', text: change.before }, { label: 'Proposed', text: change.after }] as side (side.label)}
            <section class="min-w-0 space-y-2 rounded-sm bg-muted/40 p-3">
                <h3 class="text-xs font-medium text-muted-foreground">{side.label}</h3>

                {#if change.field === 'Source' && sourceId(side.text)}
                    {@const source = sources[sourceId(side.text)!]}
                    <p class="text-sm font-medium">{source?.title ?? 'Unavailable source'}</p>
                    <p class="text-xs break-all text-muted-foreground">{source?.uri}</p>
                {:else if change.field === 'Synapse' && side.text}
                    {#each JSON.parse(side.text) as link (`${link.target}:${link.kind}:${link.note ?? ''}`)}
                        <p class="text-sm">
                            {link.kind} → {neurons[link.target] ?? 'Unavailable neuron'}
                        </p>

                        {#if link.note}
                            <p class="text-xs whitespace-pre-wrap text-muted-foreground">
                                {link.note}
                            </p>
                        {/if}
                    {/each}
                {:else}
                    <pre
                        class="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{side.text ||
                            '(none)'}</pre>
                {/if}

                {#if change.field === 'Source' && sourceId(side.text)}
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onclick={() => panel.openSource(sourceId(side.text)!)}
                    >
                        Read saved source
                    </Button>
                {/if}
            </section>
        {/each}
    </div>
</article>
