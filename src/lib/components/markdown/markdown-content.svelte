<script lang="ts">
    import { resolve } from '$app/paths';

    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { Tooltip, TooltipContent, TooltipProvider } from '#lib/components/ui/tooltip';
    import { renderMarkdownBlocks } from '#lib/markdown';
    import { createMarkdownInteractions } from '#lib/markdown/interactions.svelte';

    let {
        content,
        onSelectNeuron,
        fragment = false,
    }: {
        content: string;
        fragment?: boolean;
        onSelectNeuron?: (id: string) => void;
    } = $props();

    const blocks = $derived(
        renderMarkdownBlocks(content, (id) => resolve('/neurons/[id]', { id }), fragment),
    );

    const uid = $props.id();
    const tooltipId = `${uid}-citation`;
    const interactions = createMarkdownInteractions(tooltipId, () => onSelectNeuron);
    const citation = $derived(interactions.citation);
    $effect(() => {
        void blocks;
        return interactions.closeCitation;
    });
</script>

<div class="markdown-content min-w-0 text-sm leading-relaxed" use:interactions.interceptLinks>
    {#each blocks as block, index (index)}
        {#if block.scrollable}
            <ScrollArea orientation="horizontal" class="my-4 w-full min-w-0 rounded-sm">
                <div class="min-w-max pb-2" data-markdown-scroll>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized by renderMarkdownBlocks. -->
                    {@html block.html}
                </div>
            </ScrollArea>
        {:else}
            <div>
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized by renderMarkdownBlocks. -->
                {@html block.html}
            </div>
        {/if}
    {/each}
</div>

<TooltipProvider>
    <Tooltip
        open={citation !== null}
        onOpenChange={(open) => {
            if (!open) {
                interactions.closeCitation();
            }
        }}
    >
        <TooltipContent
            id={tooltipId}
            role="tooltip"
            customAnchor={citation?.anchor}
            sideOffset={6}
            class="max-w-sm flex-col items-start gap-1 break-words"
            onpointerenter={interactions.cancelClose}
            onpointerleave={interactions.scheduleClose}
        >
            {#if citation}
                <span class="font-medium">{citation.label}</span>
                {#if citation.description}<span>{citation.description}</span>{/if}
                <span class="text-xs break-all opacity-75">{citation.anchor.href}</span>
            {/if}
        </TooltipContent>
    </Tooltip>
</TooltipProvider>
