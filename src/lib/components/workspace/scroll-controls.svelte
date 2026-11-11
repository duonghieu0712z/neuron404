<script lang="ts">
    import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
    import ArrowUpToLineIcon from '@lucide/svelte/icons/arrow-up-to-line';

    import { Button } from '#lib/components/ui/button';
    import { Card } from '#lib/components/ui/card';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';

    let {
        canScrollUp,
        canScrollDown,
        jumpTo,
    }: {
        canScrollUp: boolean;
        canScrollDown: boolean;
        jumpTo: (edge: 'top' | 'bottom') => void;
    } = $props();
</script>

{#if canScrollUp || canScrollDown}
    <TooltipProvider>
        <Card class="absolute right-4 bottom-4 gap-1 bg-card/95 p-1 shadow-sm backdrop-blur-sm">
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Scroll to top"
                            disabled={!canScrollUp}
                            onclick={() => jumpTo('top')}
                        >
                            <ArrowUpToLineIcon class="size-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent side="left">Scroll to top</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Scroll to bottom"
                            disabled={!canScrollDown}
                            onclick={() => jumpTo('bottom')}
                        >
                            <ArrowDownToLineIcon class="size-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent side="left">Scroll to bottom</TooltipContent>
            </Tooltip>
        </Card>
    </TooltipProvider>
{/if}
