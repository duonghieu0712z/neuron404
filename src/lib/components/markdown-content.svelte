<script lang="ts">
    import { resolve } from '$app/paths';

    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { Tooltip, TooltipContent, TooltipProvider } from '#lib/components/ui/tooltip';
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

    const uid = $props.id();
    const tooltipId = `${uid}-citation`;
    let citation = $state<{
        anchor: HTMLAnchorElement;
        label: string;
        description: string;
    } | null>(null);
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    function cancelClose() {
        clearTimeout(closeTimer);
    }

    function closeCitation() {
        cancelClose();
        citation?.anchor.removeAttribute('aria-describedby');
        citation = null;
    }

    function scheduleClose() {
        cancelClose();
        closeTimer = setTimeout(() => {
            if (document.activeElement !== citation?.anchor) {
                closeCitation();
            }
        }, 150);
    }

    function showCitation(anchor: HTMLAnchorElement) {
        cancelClose();
        if (citation?.anchor !== anchor) {
            closeCitation();
        }
        anchor.setAttribute('aria-describedby', tooltipId);
        citation = {
            anchor,
            label: anchor.dataset.citationLabel ?? anchor.textContent ?? '',
            description: anchor.dataset.citationDescription ?? '',
        };
    }

    function interceptLinks(node: HTMLElement) {
        const findCitation = (target: EventTarget | null) => {
            const anchor =
                target instanceof Element
                    ? target.closest<HTMLAnchorElement>('a[data-citation]')
                    : null;
            return anchor && node.contains(anchor) ? anchor : null;
        };
        const pointerover = (event: PointerEvent) => {
            const anchor = findCitation(event.target);
            if (anchor && event.pointerType !== 'touch') {
                showCitation(anchor);
            }
        };
        const pointerout = (event: PointerEvent) => {
            const anchor = findCitation(event.target);
            if (
                anchor &&
                !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))
            ) {
                scheduleClose();
            }
        };
        const focusin = (event: FocusEvent) => {
            const anchor = findCitation(event.target);
            if (anchor) {
                showCitation(anchor);
            }
        };
        const focusout = () => closeCitation();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeCitation();
            }
        };
        const click = (event: MouseEvent) => {
            closeCitation();
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
        node.addEventListener('pointerover', pointerover);
        node.addEventListener('pointerout', pointerout);
        node.addEventListener('focusin', focusin);
        node.addEventListener('focusout', focusout);
        node.addEventListener('keydown', keydown);
        return {
            destroy() {
                closeCitation();
                node.removeEventListener('click', click);
                node.removeEventListener('pointerover', pointerover);
                node.removeEventListener('pointerout', pointerout);
                node.removeEventListener('focusin', focusin);
                node.removeEventListener('focusout', focusout);
                node.removeEventListener('keydown', keydown);
            },
        };
    }

    $effect(() => {
        void blocks;
        return closeCitation;
    });
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

<TooltipProvider>
    <Tooltip
        open={citation !== null}
        onOpenChange={(open) => {
            if (!open) {
                closeCitation();
            }
        }}
    >
        <TooltipContent
            id={tooltipId}
            role="tooltip"
            customAnchor={citation?.anchor}
            sideOffset={6}
            class="max-w-sm flex-col items-start gap-1 break-words"
            onpointerenter={cancelClose}
            onpointerleave={scheduleClose}
        >
            {#if citation}
                <span class="font-medium">{citation.label}</span>
                {#if citation.description}<span>{citation.description}</span>{/if}
                <span class="text-xs break-all opacity-75">{citation.anchor.href}</span>
            {/if}
        </TooltipContent>
    </Tooltip>
</TooltipProvider>
