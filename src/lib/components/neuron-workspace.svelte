<script lang="ts">
    import type { Snippet } from 'svelte';

    import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
    import ArrowUpToLineIcon from '@lucide/svelte/icons/arrow-up-to-line';
    import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
    import NetworkIcon from '@lucide/svelte/icons/network';
    import XIcon from '@lucide/svelte/icons/x';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';

    import NeuronDetail from '#lib/components/neuron-detail.svelte';
    import RegionOverview from '#lib/components/region-overview.svelte';
    import { Button } from '#lib/components/ui/button';
    import { Card } from '#lib/components/ui/card';
    import * as Resizable from '#lib/components/ui/resizable';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import * as Sheet from '#lib/components/ui/sheet';
    import {
        Sidebar,
        SidebarContent,
        SidebarHeader,
        SidebarProvider,
    } from '#lib/components/ui/sidebar';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';
    import { IsMobile } from '#lib/hooks/is-mobile.svelte';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { children }: { children: Snippet } = $props();

    const panel = getNeuronPanelContext();
    const isMobile = new IsMobile();
    const panelOpen = $derived(!!panel.selected || !!panel.region);
    let workspaceWidth = $state(0);
    const sidebarMinSize = $derived(
        workspaceWidth ? Math.min(45, (320 / workspaceWidth) * 100) : 30,
    );
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

    function handleWindowClick(event: MouseEvent) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        if (!target.closest('[data-neuron-surface]')) {
            return;
        }
        if (target.closest('[data-neuron-trigger]')) {
            return;
        }

        panel.close();
    }
</script>

<svelte:window onclick={handleWindowClick} />

{#snippet details()}
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
                                        aria-label={inNetwork
                                            ? 'View in Neurons'
                                            : 'View in Network'}
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
            {#if canScrollUp || canScrollDown}
                <TooltipProvider>
                    <Card
                        class="absolute right-4 bottom-4 gap-1 bg-card/95 p-1 shadow-sm backdrop-blur-sm"
                    >
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
        </SidebarContent>
    {/if}
{/snippet}

<SidebarProvider
    open={panelOpen}
    onOpenChange={(open) => {
        if (!open) {
            panel.close();
        }
    }}
    class="relative h-full min-h-full w-full items-stretch"
>
    <div class="h-full min-w-0 flex-1" bind:clientWidth={workspaceWidth}>
        <Resizable.PaneGroup direction="horizontal" autoSaveId="neuron404-workspace">
            <Resizable.Pane id="workspace" order={0} minSize={30}>
                <ScrollArea
                    data-neuron-surface={inNetwork || page.route.id?.startsWith('/neurons')
                        ? ''
                        : undefined}
                    class="h-full min-w-0 **:data-scroll-area-content:h-full"
                >
                    {@render children()}
                </ScrollArea>
            </Resizable.Pane>
            {#if panelOpen && !isMobile.current}
                <Resizable.Handle
                    withHandle
                    aria-label="Resize details sidebar"
                    class="z-10 after:w-3 hover:bg-ring focus-visible:bg-ring"
                />
                <Resizable.Pane
                    id="details"
                    order={1}
                    defaultSize={40}
                    minSize={sidebarMinSize}
                    maxSize={70}
                >
                    <Sidebar collapsible="none" side="right" class="h-full w-full">
                        {@render details()}
                    </Sidebar>
                </Resizable.Pane>
            {/if}
        </Resizable.PaneGroup>
    </div>
    {#if isMobile.current}
        <Sheet.Root
            open={panelOpen}
            onOpenChange={(open) => {
                if (!open) {
                    panel.close();
                }
            }}
        >
            <Sheet.Content
                side="right"
                showCloseButton={false}
                class="w-[min(34rem,100vw)] gap-0 p-0"
            >
                <Sheet.Header class="sr-only">
                    <Sheet.Title>Details</Sheet.Title>
                    <Sheet.Description>Selected neuron or region details.</Sheet.Description>
                </Sheet.Header>
                {@render details()}
            </Sheet.Content>
        </Sheet.Root>
    {/if}
</SidebarProvider>
