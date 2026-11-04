<script lang="ts">
    import type { LayoutProps } from './$types';

    import NeuronDetail from '#lib/components/neuron-detail.svelte';
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
    <div class="absolute inset-0 flex flex-col">
        {@render children()}
    </div>

    <Sidebar side="right" class="top-14 bottom-0 h-auto">
        {#if panel.selected}
            <SidebarHeader class="border-b">
                <h2 class="truncate text-sm font-semibold">{panel.selected.neuron.title}</h2>
            </SidebarHeader>
            <SidebarContent class="p-4">
                <NeuronDetail data={panel.selected} layout="panel" onSelectNeuron={panel.open} />
            </SidebarContent>
        {/if}
    </Sidebar>
</SidebarProvider>
