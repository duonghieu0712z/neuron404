<script lang="ts">
    import type { Snippet } from 'svelte';

    import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

    import { Button } from '#lib/components/ui/button';
    import {
        Collapsible,
        CollapsibleContent,
        CollapsibleTrigger,
    } from '#lib/components/ui/collapsible';

    let {
        title,
        count,
        open = $bindable(true),
        class: className,
        contentClass,
        iconOnly = false,
        vertical = false,
        summary,
        children,
    }: {
        title: string;
        count?: number;
        open?: boolean;
        class?: string;
        contentClass?: string;
        iconOnly?: boolean;
        vertical?: boolean;
        summary?: Snippet;
        children: Snippet;
    } = $props();
    const toggleLabel = $derived(`${open ? 'Collapse' : 'Expand'} ${title}`);

    const chevronRotation = $derived.by(() => {
        if (vertical) {
            return open ? 'rotate-90' : '-rotate-90';
        }
        return open ? 'rotate-90' : '';
    });
</script>

<Collapsible bind:open class={className}>
    <div class="flex shrink-0 items-center gap-2">
        <CollapsibleTrigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    variant="ghost"
                    size={iconOnly ? 'icon-sm' : 'sm'}
                    class={[
                        'bg-transparent!',
                        iconOnly ? 'shrink-0' : 'h-7 w-full justify-start gap-2 px-2 text-xs',
                    ]}
                    aria-label={iconOnly ? toggleLabel : undefined}
                    title={iconOnly ? toggleLabel : undefined}
                >
                    {#if !iconOnly}
                        <span>{title}</span>
                        {#if count !== undefined}
                            <span class="font-normal text-muted-foreground tabular-nums">
                                {count}
                            </span>
                        {/if}
                    {/if}
                    <ChevronRightIcon
                        class={[
                            iconOnly ? 'size-4' : 'ml-auto size-3 text-muted-foreground',
                            'transition-transform',
                            chevronRotation,
                        ]}
                    />
                </Button>
            {/snippet}
        </CollapsibleTrigger>
        {#if summary}
            {@render summary()}
        {/if}
    </div>
    <CollapsibleContent class={contentClass}>
        {@render children()}
    </CollapsibleContent>
</Collapsible>
