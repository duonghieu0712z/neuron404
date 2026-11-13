<script lang="ts">
    import type { MembershipMode } from '#lib/network/membership';
    import type Sigma from 'sigma';

    import EyeOffIcon from '@lucide/svelte/icons/eye-off';
    import MaximizeIcon from '@lucide/svelte/icons/maximize';
    import MinusIcon from '@lucide/svelte/icons/minus';
    import MousePointer2Icon from '@lucide/svelte/icons/mouse-pointer-2';
    import PauseIcon from '@lucide/svelte/icons/pause';
    import PlayIcon from '@lucide/svelte/icons/play';
    import PlusIcon from '@lucide/svelte/icons/plus';
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
    import TagsIcon from '@lucide/svelte/icons/tags';
    import WaypointsIcon from '@lucide/svelte/icons/waypoints';

    import { Button } from '#lib/components/ui/button';
    import { Card } from '#lib/components/ui/card';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';
    import { fitNetworkInView } from '#lib/network/camera';
    import { MEMBERSHIP_MODES } from '#lib/network/membership';

    import NetworkSection from './network-section.svelte';

    let {
        renderer,
        refreshing,
        refreshNetwork,
        controlsOpen = $bindable(),
        membershipMode = $bindable(),
        showLabels = $bindable(),
        motionEnabled = $bindable(),
        reducedMotion,
    }: {
        renderer: Sigma | null;
        refreshing: boolean;
        refreshNetwork: () => Promise<void>;
        controlsOpen: boolean;
        membershipMode: MembershipMode;
        showLabels: boolean;
        motionEnabled: boolean;
        reducedMotion: boolean;
    } = $props();

    let refreshFeedback = $state(false);
    $effect(() => {
        if (refreshing) {
            refreshFeedback = true;
        }
    });
    const membershipShortLabels = { hidden: 'Off', auto: 'Auto', all: 'All' };

    const membershipLabel = $derived(
        MEMBERSHIP_MODES.find((mode) => mode.value === membershipMode)!.label,
    );

    const nextMembershipMode = $derived(
        MEMBERSHIP_MODES[
            (MEMBERSHIP_MODES.findIndex((mode) => mode.value === membershipMode) + 1) %
                MEMBERSHIP_MODES.length
        ],
    );

    const motionTooltip = $derived.by(() => {
        if (reducedMotion) {
            return 'Reduced motion is enabled';
        }

        return motionEnabled ? 'Pause motion' : 'Resume motion';
    });

    const controls = $derived([
        { label: 'Refresh network', icon: RefreshCwIcon, action: refreshNetwork },
        {
            label: 'Zoom in',
            icon: PlusIcon,
            action: () => renderer?.getCamera().zoomIn({ duration: 200 }),
        },
        {
            label: 'Zoom out',
            icon: MinusIcon,
            action: () => renderer?.getCamera().zoomOut({ duration: 200 }),
        },
        { label: 'Reset view', icon: MaximizeIcon, action: () => fitNetworkInView(renderer) },
    ]);
</script>

<TooltipProvider>
    <Card
        class="absolute right-4 bottom-4 gap-0 bg-card/95 p-1 shadow-sm backdrop-blur-sm"
        data-neuron-trigger
    >
        <NetworkSection title="Controls" iconOnly vertical bind:open={controlsOpen}>
            <div class="flex flex-col items-center gap-1 pt-1">
                {#each controls as control (control.label)}
                    <Tooltip>
                        <TooltipTrigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={control.label}
                                    aria-busy={control.action === refreshNetwork
                                        ? refreshing
                                        : undefined}
                                    class={control.action === refreshNetwork
                                        ? 'group motion-safe:transition-transform motion-safe:active:scale-90'
                                        : undefined}
                                    disabled={!renderer ||
                                        (refreshing && control.action !== refreshNetwork)}
                                    onclick={() => void control.action()}
                                >
                                    {#if control.action === refreshNetwork}
                                        <span
                                            class="inline-flex motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:rotate-90"
                                        >
                                            <control.icon
                                                class={[
                                                    'size-4',
                                                    (refreshing || refreshFeedback) &&
                                                        'motion-safe:animate-[spin_600ms_linear_infinite]',
                                                ]}
                                                onanimationiteration={() => {
                                                    if (!refreshing) {
                                                        refreshFeedback = false;
                                                    }
                                                }}
                                            />
                                        </span>
                                    {:else}
                                        <control.icon class="size-4" />
                                    {/if}
                                </Button>
                            {/snippet}
                        </TooltipTrigger>
                        <TooltipContent side="left">{control.label}</TooltipContent>
                    </Tooltip>
                {/each}
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Region membership: ${membershipLabel}. Switch to ${nextMembershipMode.label}.`}
                                data-membership-mode={membershipMode}
                                disabled={!renderer}
                                onclick={() => {
                                    membershipMode = nextMembershipMode.value;
                                }}
                            >
                                {#if membershipMode === 'hidden'}
                                    <EyeOffIcon class="size-4" />
                                {:else if membershipMode === 'auto'}
                                    <MousePointer2Icon class="size-4" />
                                {:else}
                                    <WaypointsIcon class="size-4" />
                                {/if}
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        Membership: {membershipShortLabels[membershipMode]}
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant={showLabels ? 'secondary' : 'ghost'}
                                size="icon-sm"
                                aria-label="Show neuron labels"
                                aria-pressed={showLabels}
                                disabled={!renderer}
                                onclick={() => {
                                    showLabels = !showLabels;
                                }}
                            >
                                <TagsIcon class="size-4" />
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="left">Toggle labels</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={motionEnabled && !reducedMotion
                                    ? 'Pause motion'
                                    : 'Resume motion'}
                                disabled={!renderer || reducedMotion}
                                onclick={() => {
                                    motionEnabled = !motionEnabled;
                                }}
                            >
                                {#if motionEnabled && !reducedMotion}<PauseIcon
                                        class="size-4"
                                    />{:else}<PlayIcon class="size-4" />{/if}
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        {motionTooltip}
                    </TooltipContent>
                </Tooltip>
            </div>
        </NetworkSection>
    </Card>
</TooltipProvider>
