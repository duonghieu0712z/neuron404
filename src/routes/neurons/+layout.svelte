<script lang="ts">
    import type { LayoutProps } from './$types';

    import XIcon from '@lucide/svelte/icons/x';

    import NeuronDetail from '#lib/components/neuron-detail.svelte';
    import { Button } from '#lib/components/ui/button';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import {
        Sidebar,
        SidebarContent,
        SidebarHeader,
        SidebarProvider,
    } from '#lib/components/ui/sidebar';
    import { createNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { children }: LayoutProps = $props();

    const panel = createNeuronPanelContext();

    function handleWindowClick(event: MouseEvent) {
        if (panel.consumeTrigger()) return;
        if (!panel.selected) return;

        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-slot="sidebar-inner"]')) return;
        if (target?.closest('[data-neuron-trigger]')) return;

        panel.close();
    }
</script>

<svelte:window onclick={handleWindowClick} />

<SidebarProvider
    open={!!panel.selected}
    onOpenChange={(open) => {
        if (!open) panel.close();
    }}
    style="--sidebar-width: 34rem;"
    class="relative h-full min-h-full w-full items-stretch"
>
    <ScrollArea class="h-full min-w-0 flex-1 **:data-scroll-area-content:h-full">
        {@render children()}
    </ScrollArea>

    <Sidebar side="right" class="top-14 bottom-0 h-auto">
        {#if panel.selected}
            <SidebarHeader class="flex-row items-center justify-between border-b">
                <h2 class="min-w-0 truncate text-sm font-semibold">
                    {panel.selected.neuron.title}
                </h2>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close neuron details"
                    onclick={panel.close}
                >
                    <XIcon class="size-4" />
                </Button>
            </SidebarHeader>
            <SidebarContent class="overflow-hidden">
                <ScrollArea class="min-h-0 flex-1">
                    <div class="p-4">
                        <NeuronDetail
                            data={panel.selected}
                            layout="panel"
                            onSelectNeuron={panel.open}
                        />
                    </div>
                </ScrollArea>
            </SidebarContent>
        {/if}
    </Sidebar>
</SidebarProvider>
