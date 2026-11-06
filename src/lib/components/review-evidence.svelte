<script lang="ts">
    import type { ReviewOutput, ReviewView } from '#lib/neuron/review';

    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
    import { resolve } from '$app/paths';

    import MarkdownContent from '#lib/components/markdown-content.svelte';
    import { Button } from '#lib/components/ui/button';
    import {
        Collapsible,
        CollapsibleContent,
        CollapsibleTrigger,
    } from '#lib/components/ui/collapsible';
    import { reviewEvidenceKey } from '#lib/neuron/review';

    let {
        evidence,
        details,
        onSelectNeuron,
    }: {
        evidence: ReviewOutput['checks'][number]['evidence'];
        details: ReviewView['evidenceDetails'];
        onSelectNeuron?: (id: string) => void;
    } = $props();
    const sourceLabels = {
        overview: 'Region overview',
        source: 'Captured source',
        neuron: 'Neuron',
    };

    let expanded = $state<Record<string, boolean>>({});
    let overflowing = $state<Record<string, boolean>>({});

    function measure(node: HTMLElement, key: string) {
        const observer = new ResizeObserver(() => {
            overflowing[key] = node.scrollHeight > 144;
        });
        observer.observe(node);
        return { destroy: () => observer.disconnect() };
    }
</script>

{#if evidence.length}
    <Collapsible class="group/evidence">
        <CollapsibleTrigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    variant="ghost"
                    size="sm"
                    class="h-auto w-full justify-between bg-transparent! px-0 py-1 text-xs text-muted-foreground"
                >
                    <span>Evidence · {evidence.length}</span>
                    <ChevronDownIcon
                        class="size-3 transition-transform group-data-[state=open]/evidence:rotate-180"
                    />
                </Button>
            {/snippet}
        </CollapsibleTrigger>
        <CollapsibleContent class="space-y-4 pt-2">
            {#each evidence as item, index (index)}
                {@const key = reviewEvidenceKey(item)}
                {@const source = details[key]}
                <section class="min-w-0 space-y-2 border-l pl-3">
                    <div class="space-y-1">
                        <p class="text-[10px] text-muted-foreground">
                            {sourceLabels[item.kind]}
                        </p>
                        {#if item.kind === 'neuron' && source?.available}
                            <a
                                href={resolve('/neurons/[id]', { id: item.id })}
                                class="text-xs font-medium underline-offset-4 hover:underline"
                                onclick={(event) => {
                                    if (
                                        !onSelectNeuron ||
                                        event.button !== 0 ||
                                        event.metaKey ||
                                        event.ctrlKey ||
                                        event.shiftKey ||
                                        event.altKey
                                    ) {
                                        return;
                                    }
                                    event.preventDefault();
                                    onSelectNeuron(item.id);
                                }}
                            >
                                {source.title}
                            </a>
                        {:else}
                            <p class="text-xs font-medium">{source?.title ?? 'Stored evidence'}</p>
                        {/if}
                        {#if !source?.matchesCurrent}
                            <p class="text-[10px] text-muted-foreground">
                                Saved excerpt · current context unavailable or changed
                            </p>
                        {/if}
                    </div>
                    <div class="relative">
                        <div
                            class={['min-w-0', !expanded[key] && 'max-h-36 overflow-hidden']}
                            use:measure={key}
                        >
                            {#if source?.leading}<p
                                    class="text-xs text-muted-foreground"
                                    aria-label="Earlier content omitted"
                                >
                                    …
                                </p>{/if}
                            <MarkdownContent content={item.quote} fragment {onSelectNeuron} />
                            {#if source?.trailing}<p
                                    class="text-xs text-muted-foreground"
                                    aria-label="Later content omitted"
                                >
                                    …
                                </p>{/if}
                        </div>
                        {#if overflowing[key] && !expanded[key]}
                            <div
                                class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent"
                            ></div>
                        {/if}
                    </div>
                    {#if overflowing[key] || expanded[key]}
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-auto bg-transparent! px-0 py-1 text-xs text-muted-foreground hover:underline"
                            aria-expanded={!!expanded[key]}
                            onclick={() => (expanded[key] = !expanded[key])}
                        >
                            {expanded[key] ? 'Show less' : 'Show full excerpt'}
                        </Button>
                    {/if}
                </section>
            {/each}
        </CollapsibleContent>
    </Collapsible>
{/if}
