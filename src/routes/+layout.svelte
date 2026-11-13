<script lang="ts">
    import type { LayoutProps } from './$types';

    import { page } from '$app/state';
    import { ModeWatcher } from 'mode-watcher';

    import AppHeader from '#lib/components/workspace/app-header.svelte';
    import NeuronWorkspace from '#lib/components/workspace/neuron-workspace.svelte';
    import { createNeuronPanelContext } from '#lib/neuron-panel.svelte';

    import './layout.css';

    let { children, data }: LayoutProps = $props();
    createNeuronPanelContext();
</script>

<svelte:head>
    <title>neuron404</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<ModeWatcher />

{#if page.route.id === '/login'}
    {@render children()}
{:else}
    <a
        href="#main-content"
        class="sr-only rounded-sm bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
    >
        Skip to main content
    </a>

    <AppHeader authEnabled={data.authEnabled} />

    <main id="main-content" class="h-[calc(100dvh-3.5rem)]">
        <NeuronWorkspace>
            {@render children()}
        </NeuronWorkspace>
    </main>
{/if}
