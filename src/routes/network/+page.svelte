<script lang="ts">
    import type { PageProps } from './$types';
    import type { NetworkData } from '#lib/network/types';
    import type Sigma from 'sigma';
    import type { CameraState } from 'sigma/types';

    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { mode } from 'mode-watcher';
    import { untrack } from 'svelte';

    import NetworkControls from '#lib/components/network/network-controls.svelte';
    import NetworkOverview from '#lib/components/network/network-overview.svelte';
    import { createNetworkLiveUpdates } from '#lib/network/live-updates';
    import { type MembershipMode } from '#lib/network/membership';
    import { createNetworkPreferences } from '#lib/network/preferences.svelte';
    import { getRegionNodeId } from '#lib/network/region-node';
    import { createNetworkRenderer } from '#lib/network/renderer';
    import { createNetworkSearch } from '#lib/network/search.svelte';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';

    let { data }: PageProps = $props();

    let liveNetwork = $state.raw<NetworkData | null>(null);

    const network = $derived(liveNetwork ?? data.network);

    let updatesFailed = $state(false);
    let refreshSnapshot = $state<(() => Promise<void>) | null>(null);

    const preferences = createNetworkPreferences();
    const panel = getNeuronPanelContext();

    const networkQuery = $derived(
        (page.shallow?.url ?? page.url).searchParams.get('q')?.trim() ?? '',
    );

    const search = createNetworkSearch(
        () => networkQuery,
        () => network.nodes,
    );

    let applyFilter = $state<((ids: Set<string> | null) => void) | null>(null);

    const theme = $derived(mode.current === 'dark' ? 'dark' : 'light');

    let containerEl = $state<HTMLDivElement>();
    let renderer = $state.raw<Sigma | null>(null);
    let hoveredNode = $state<string | null>(null);

    const selectedRegionId = $derived(panel.region?.region.id ?? null);

    let applyMembership = $state<((mode: MembershipMode) => void) | null>(null);
    let reducedMotion = $state(false);
    let applyMotion = $state<((enabled: boolean) => void) | null>(null);
    let applyLabels = $state<((visible: boolean) => void) | null>(null);
    let applyFocus = $state<((id: string | null, selected: string | null) => void) | null>(null);
    let refreshing = $state(false);

    const positions: Record<string, { x: number; y: number } | undefined> = {};

    $effect(() => {
        const revision = data.revision;

        liveNetwork = null;

        const updates = createNetworkLiveUpdates({
            url: resolve('/network/snapshot'),
            revision,
            onUpdate: (value) => {
                liveNetwork = value;
            },
            onError: (failed) => {
                updatesFailed = failed;
            },
        });

        refreshSnapshot = updates.refresh;

        return () => {
            updates.dispose();
            refreshSnapshot = null;
        };
    });

    async function refreshNetwork() {
        refreshing = true;

        try {
            await refreshSnapshot?.();
        } finally {
            refreshing = false;
        }
    }

    let view: {
        camera: CameraState;
        bounds: ReturnType<Sigma['getBBox']>;
    } | null = null;

    const focusedRegion = $derived(
        network.regions.find((region) =>
            hoveredNode
                ? getRegionNodeId(region.id) === hoveredNode
                : region.id === selectedRegionId,
        ),
    );

    const focusedNode = $derived(
        network.nodes.find((node) => node.id === (hoveredNode ?? panel.selected?.neuron.id)),
    );

    const connectionCount = $derived(
        focusedNode
            ? network.edges.filter(
                  (edge) => edge.source === focusedNode.id || edge.target === focusedNode.id,
              ).length
            : 0,
    );

    $effect(() => {
        applyFilter?.(search.ids);

        const selected = selectedRegionId
            ? getRegionNodeId(selectedRegionId)
            : (panel.selected?.neuron.id ?? null);

        const searchOwnsFocus = networkQuery.length > 0 && !search.error;

        applyFocus?.(
            searchOwnsFocus ? hoveredNode : (hoveredNode ?? selected),
            searchOwnsFocus ? null : selected,
        );
    });

    $effect(() => {
        applyLabels?.(preferences.showLabels);
    });

    $effect(() => {
        applyMembership?.(preferences.membershipMode);
    });

    $effect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');

        const updatePreference = () => {
            reducedMotion = media.matches;
        };

        updatePreference();
        media.addEventListener('change', updatePreference);

        return () => media.removeEventListener('change', updatePreference);
    });

    $effect(() => {
        applyMotion?.(preferences.motionEnabled && !reducedMotion);
    });

    $effect(() => {
        if (!preferences.ready || !containerEl || network.nodes.length === 0) {
            return;
        }

        if (!network.nodes.some((node) => positions[node.id])) {
            view = null;
        }

        const runtime = createNetworkRenderer({
            data: network,
            container: containerEl,
            positions,
            theme: mode.current === 'dark' ? 'dark' : 'light',
            membershipMode: untrack(() => preferences.membershipMode),
            motionEnabled: untrack(() => preferences.motionEnabled),
            onHover: (id) => {
                hoveredNode = id;
            },
            onOpenNeuron: panel.open,
            onOpenRegion: panel.openRegion,
            onClose: panel.close,
        });

        if (view) {
            runtime.renderer.setCustomBBox(view.bounds);
            runtime.renderer.refresh();
            runtime.renderer.getCamera().setState(view.camera);
        }

        renderer = runtime.renderer;
        applyMembership = runtime.setMembership;
        applyLabels = runtime.setLabels;
        applyFilter = runtime.setFilter;
        applyFocus = runtime.setFocus;
        applyMotion = runtime.setMotion;

        return () => {
            const current = runtime.renderer;

            view = {
                camera: current.getCamera().getState(),
                bounds: current.getCustomBBox() ?? current.getBBox(),
            };
            current.getGraph().forEachNode((id, attributes) => {
                positions[id] = { x: attributes.x, y: attributes.y };
            });
            runtime.dispose();
            hoveredNode = null;
            applyMotion = null;
            applyFocus = null;
            applyFilter = null;
            applyLabels = null;
            applyMembership = null;
            renderer = null;
        };
    });
</script>

<svelte:head>
    <title>Network · neuron404</title>
</svelte:head>

<section
    class="network-surface relative h-full min-h-0 overflow-hidden"
    aria-label="Knowledge network"
    data-neuron-surface
>
    {#if network.nodes.length === 0}
        <div class="flex h-full items-center justify-center">
            <p class="text-sm text-muted-foreground">
                Saved neurons and their connections will appear here.
            </p>
        </div>
    {:else}
        <div
            bind:this={containerEl}
            data-neuron-trigger
            class="absolute inset-0"
            aria-label="Interactive neuron network"
        ></div>
    {/if}

    {#if updatesFailed}
        <p
            class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-sm bg-card/95 px-3 py-2 text-xs text-muted-foreground"
            role="status"
        >
            Live updates unavailable. Retrying…
        </p>
    {/if}

    {#if search.error || search.searching || (networkQuery && search.ids?.size === 0)}
        <div
            class="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
            aria-live="polite"
        >
            <p class="text-sm text-muted-foreground">
                {search.error ??
                    (search.searching ? 'Searching…' : `No results for "${networkQuery}".`)}
            </p>
        </div>
    {/if}

    <NetworkOverview
        data={network}
        {theme}
        bind:overviewOpen={preferences.overviewOpen}
        bind:sections={preferences.sections}
        {focusedNode}
        {focusedRegion}
        {connectionCount}
        {selectedRegionId}
    />

    <NetworkControls
        {renderer}
        {refreshing}
        {refreshNetwork}
        bind:controlsOpen={preferences.controlsOpen}
        bind:membershipMode={preferences.membershipMode}
        bind:showLabels={preferences.showLabels}
        bind:motionEnabled={preferences.motionEnabled}
        {reducedMotion}
    />
</section>

<style>
    .network-surface {
        background-image: radial-gradient(
            circle,
            color-mix(in oklch, var(--muted-foreground) 18%, transparent) 1px,
            transparent 1px
        );
        background-size: 24px 24px;
    }
</style>
