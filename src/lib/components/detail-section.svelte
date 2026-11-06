<script lang="ts">
    import type { Snippet } from 'svelte';

    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader } from '#lib/components/ui/card';
    import {
        Collapsible,
        CollapsibleContent,
        CollapsibleTrigger,
    } from '#lib/components/ui/collapsible';

    let {
        title,
        count,
        open = $bindable(true),
        size = 'sm',
        summary,
        children,
    }: {
        title: string;
        count?: number;
        open?: boolean;
        size?: 'sm' | 'default';
        summary?: Snippet;
        children: Snippet;
    } = $props();
</script>

<Collapsible bind:open>
    <Card {size} class="gap-0">
        <CardHeader class="gap-2">
            <CollapsibleTrigger>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant="ghost"
                        class="h-auto w-full justify-between gap-2 bg-transparent! p-0 text-left text-sm"
                    >
                        <span class="flex items-center gap-2">
                            <span class="font-semibold">{title}</span>
                            {#if count !== undefined}<span
                                    class="text-xs text-muted-foreground tabular-nums"
                                >
                                    {count}
                                </span>{/if}
                        </span>
                        <ChevronDownIcon
                            class={[
                                'size-4 shrink-0 text-muted-foreground transition-transform',
                                open && 'rotate-180',
                            ]}
                        />
                    </Button>
                {/snippet}
            </CollapsibleTrigger>
            {@render summary?.()}
        </CardHeader>
        <CollapsibleContent>
            <CardContent>{@render children()}</CardContent>
        </CollapsibleContent>
    </Card>
</Collapsible>
