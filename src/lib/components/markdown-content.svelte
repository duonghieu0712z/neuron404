<script lang="ts">
    import { resolve } from '$app/paths';

    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { renderMarkdownBlocks } from '#lib/markdown';

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

    function interceptLinks(node: HTMLElement) {
        const click = (event: MouseEvent) => {
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
            const target = event.target;
            const link =
                target instanceof Element
                    ? target.closest<HTMLAnchorElement>('a[data-neuron-id]')
                    : null;
            const id = link?.dataset.neuronId;
            if (!id || !node.contains(link)) {
                return;
            }
            event.preventDefault();
            onSelectNeuron(id);
        };
        node.addEventListener('click', click);
        return { destroy: () => node.removeEventListener('click', click) };
    }
</script>

<div class="markdown-content min-w-0 text-sm leading-relaxed" use:interceptLinks>
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
