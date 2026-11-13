<script lang="ts">
    import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
    import NetworkIcon from '@lucide/svelte/icons/network';
    import XIcon from '@lucide/svelte/icons/x';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';

    import NeuronDetail from '#lib/components/neuron/neuron-detail.svelte';
    import RegionOverview from '#lib/components/neuron/region-overview.svelte';
    import { Button } from '#lib/components/ui/button';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { SidebarContent, SidebarHeader } from '#lib/components/ui/sidebar';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    import ScrollControls from './scroll-controls.svelte';

    const panel = getNeuronPanelContext();
    const inNetwork = $derived(page.url.pathname === resolve('/network'));

    let sidebarViewport = $state<HTMLElement | null>(null);
    let canScrollUp = $state(false);
    let canScrollDown = $state(false);

    $effect(() => {
        const viewport = sidebarViewport;

        if (!viewport) {
            canScrollUp = false;
            canScrollDown = false;
            return;
        }

        const update = () => {
            canScrollUp = viewport.scrollTop > 1;
            canScrollDown = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
        };

        const observer = new ResizeObserver(update);
        observer.observe(viewport);

        if (viewport.firstElementChild) {
            observer.observe(viewport.firstElementChild);
        }

        viewport.addEventListener('scroll', update, { passive: true });
        const frame = requestAnimationFrame(update);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            viewport.removeEventListener('scroll', update);
        };
    });

    $effect(() => {
        const id = panel.selected?.neuron.id ?? panel.region?.region.id;

        if (id) {
            sidebarViewport?.scrollTo({ top: 0, behavior: 'auto' });
        }
    });

    function jumpTo(edge: 'top' | 'bottom') {
        sidebarViewport?.scrollTo({
            top: edge === 'top' ? 0 : sidebarViewport.scrollHeight,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
        });
    }
</script>

{#if panel.selected || panel.region}
    <SidebarHeader class="flex-row items-center justify-between border-b">
        <h2 class="min-w-0 truncate text-sm font-semibold">
            {panel.region?.region.title ?? panel.selected?.neuron.title}
        </h2>
        <TooltipProvider>
            <div class="flex shrink-0 items-center gap-1">
                {#if panel.selected}
                    <Tooltip>
                        <TooltipTrigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    href={inNetwork ? resolve('/neurons') : resolve('/network')}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={inNetwork ? 'View in Neurons' : 'View in Network'}
                                >
                                    {#if inNetwork}
                                        <LayoutGridIcon class="size-4" />
                                    {:else}
                                        <NetworkIcon class="size-4" />
                                    {/if}
                                </Button>
                            {/snippet}
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {inNetwork ? 'View in Neurons' : 'View in Network'}
                        </TooltipContent>
                    </Tooltip>
                {/if}
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close details"
                    onclick={panel.close}
                >
                    <XIcon class="size-4" />
                </Button>
            </div>
        </TooltipProvider>
    </SidebarHeader>
    <SidebarContent class="relative overflow-hidden">
        <ScrollArea bind:viewportRef={sidebarViewport} class="min-h-0 flex-1">
            <div class="p-4 pb-20 [&_a]:underline-offset-4 [&_a:hover]:underline">
                {#if panel.region}
                    <RegionOverview data={panel.region} onSelectNeuron={panel.open} />
                {:else if panel.selected}
                    <NeuronDetail
                        data={panel.selected}
                        layout="panel"
                        onSelectNeuron={panel.open}
                    />
                {/if}
            </div>
        </ScrollArea>
        <ScrollControls {canScrollUp} {canScrollDown} {jumpTo} />
    </SidebarContent>
{/if}
