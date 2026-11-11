import { onMount } from 'svelte';

import { isMembershipMode, type MembershipMode } from './membership';

export function createNetworkPreferences() {
    const preferences = $state({
        overviewOpen: true,
        controlsOpen: true,
        showLabels: true,
        motionEnabled: true,
        membershipMode: 'auto' as MembershipMode,
        sections: {
            regions: true,
            legend: true,
            shape: true,
            nodeColor: true,
            stroke: true,
            edgeColor: true,
        },
        ready: false,
    });

    const PREFERENCES_KEY = 'neuron404:network-preferences';

    onMount(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');

            if (saved && typeof saved === 'object') {
                if (typeof saved.overviewOpen === 'boolean') {
                    preferences.overviewOpen = saved.overviewOpen;
                }

                if (typeof saved.controlsOpen === 'boolean') {
                    preferences.controlsOpen = saved.controlsOpen;
                }

                if (typeof saved.showLabels === 'boolean') {
                    preferences.showLabels = saved.showLabels;
                }

                if (typeof saved.motionEnabled === 'boolean') {
                    preferences.motionEnabled = saved.motionEnabled;
                }

                if (isMembershipMode(saved.membershipMode)) {
                    preferences.membershipMode = saved.membershipMode;
                }

                for (const key of Object.keys(
                    preferences.sections,
                ) as (keyof typeof preferences.sections)[]) {
                    if (typeof saved.sections?.[key] === 'boolean') {
                        preferences.sections[key] = saved.sections[key];
                    }
                }
            }
        } catch {
            // Keep defaults when browser storage is unavailable or invalid.
        }

        preferences.ready = true;
    });

    $effect(() => {
        if (!preferences.ready) {
            return;
        }

        const serialized = JSON.stringify({
            overviewOpen: preferences.overviewOpen,
            controlsOpen: preferences.controlsOpen,
            showLabels: preferences.showLabels,
            motionEnabled: preferences.motionEnabled,
            membershipMode: preferences.membershipMode,
            sections: preferences.sections,
        });

        try {
            localStorage.setItem(PREFERENCES_KEY, serialized);
        } catch {
            // Browsing remains available when storage is disabled or full.
        }
    });

    return preferences;
}
