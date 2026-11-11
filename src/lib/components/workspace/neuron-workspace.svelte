<script lang="ts">
    import type { Snippet } from 'svelte';

    import { resolve } from '$app/paths';
    import { page } from '$app/state';

    import * as Resizable from '#lib/components/ui/resizable';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import * as Sheet from '#lib/components/ui/sheet';
    import { Sidebar, SidebarProvider } from '#lib/components/ui/sidebar';
    import DetailsPanel from '#lib/components/workspace/details-panel.svelte';
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
                        <DetailsPanel />
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
                <DetailsPanel />
            </Sheet.Content>
        </Sheet.Root>
    {/if}
</SidebarProvider>
