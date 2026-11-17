import type { NetworkSelection } from './selection';
import type { NetworkData } from './types';
import type Sigma from 'sigma';

import { tick, untrack } from 'svelte';

import { focusNetworkScope } from './camera';
import { resolveNetworkFocus } from './focus';
import { getRegionNodeId } from './region-node';
import { normalizeNetworkSelection } from './selection';

interface FocusOptions {
    data: () => NetworkData;
    renderer: () => Sigma | null;
    selectedNeuron: () => string | null;
    selectedRegion: () => string | null;
    preferredRegion: () => string | null;
    autoFocus: () => boolean;
    openNeuron: (id: string) => Promise<void>;
    openRegion: (id: string) => Promise<void>;
    close: () => void;
}

export function createNetworkFocus(options: FocusOptions) {
    let regionId = $state<string | null>(null);
    let request = $state(0);
    let pending = $state(false);
    let error = $state<string | null>(null);
    let choice = $state.raw<NetworkSelection | null>(null);
    let cameraRegionId: string | null = null;
    let cameraSelection: string | null = null;
    let forcedSelection: string | null = null;
    let operation = 0;

    function selection(): NetworkSelection {
        const neuronId = options.selectedNeuron();
        return { neuronId, regionId: neuronId ? regionId : options.selectedRegion() };
    }

    async function openSelection(value: NetworkSelection, force = false) {
        const current = ++operation;
        const normalized = normalizeNetworkSelection(options.data(), value);
        if (!normalized) {
            pending = false;
            error = 'The selected neuron or region is unavailable.';
            return false;
        }
        pending = true;
        error = null;
        try {
            if (normalized.neuronId) {
                await options.openNeuron(normalized.neuronId);
            } else if (normalized.regionId) {
                await options.openRegion(normalized.regionId);
            } else {
                options.close();
            }
            if (current !== operation) {
                return false;
            }
            const opened = normalized.neuronId
                ? options.selectedNeuron() === normalized.neuronId
                : options.selectedRegion() === normalized.regionId && !options.selectedNeuron();
            if (!opened) {
                error = 'Could not open the selected knowledge.';
                return false;
            }
            choice = normalized;
            request++;
            const id =
                normalized.neuronId ??
                (normalized.regionId ? getRegionNodeId(normalized.regionId) : null);
            forcedSelection = force ? `${request}:${id}` : null;
            return true;
        } catch {
            if (current === operation) {
                error = 'Could not open the selected knowledge.';
            }
            return false;
        } finally {
            if (current === operation) {
                pending = false;
            }
        }
    }

    $effect(() => {
        const region = options.selectedRegion();
        const neuron = options.selectedNeuron();
        const selected = region ? getRegionNodeId(region) : neuron;
        const renderer = options.renderer();
        const selectionKey = `${request}:${selected}`;
        const automatic = options.autoFocus();
        if (pending || !renderer) {
            return;
        }
        const target = untrack(() =>
            selected
                ? resolveNetworkFocus(
                      options.data(),
                      selected,
                      (choice?.neuronId === neuron ? choice?.regionId : null) ||
                          options.preferredRegion() ||
                          regionId ||
                          cameraRegionId,
                  )
                : null,
        );
        regionId = target?.regionId ?? null;
        if (cameraSelection === selectionKey) {
            return;
        }
        if (!selected) {
            cameraSelection = selectionKey;
            forcedSelection = null;
            return;
        }
        if (!target) {
            return;
        }

        const force = forcedSelection === selectionKey;
        let cancelled = false;
        let frame: number | undefined;
        void tick().then(() => {
            if (cancelled) {
                return;
            }
            frame = requestAnimationFrame(() => {
                if (cancelled || options.renderer() !== renderer) {
                    return;
                }
                renderer.resize();
                if (automatic || force) {
                    focusNetworkScope(renderer, target.nodeIds, selected);
                }
                cameraRegionId = target.regionId;
                cameraSelection = selectionKey;
                forcedSelection = null;
            });
        });
        return () => {
            cancelled = true;
            if (frame !== undefined) {
                cancelAnimationFrame(frame);
            }
        };
    });

    return {
        get regionId() {
            return regionId;
        },
        get selection() {
            return selection();
        },
        get pending() {
            return pending;
        },
        get error() {
            return error;
        },
        openNeuron(id: string) {
            return openSelection({ neuronId: id, regionId: null });
        },
        openRegion(id: string) {
            return openSelection({ neuronId: null, regionId: id });
        },
        selectRegion(id: string) {
            const neuronId = options.selectedNeuron();
            if (
                pending ||
                !neuronId ||
                !options
                    .data()
                    .nodes.find((node) => node.id === neuronId)
                    ?.regions.includes(id)
            ) {
                return;
            }
            choice = { neuronId, regionId: id };
            error = null;
            request++;
            forcedSelection = `${request}:${neuronId}`;
        },
        async restoreSelection(value: NetworkSelection) {
            const expectedOperation = operation + 1;
            const opened = await openSelection(value, true);
            if (!opened && operation === expectedOperation) {
                options.close();
                regionId = null;
            }
            return opened;
        },
    };
}
