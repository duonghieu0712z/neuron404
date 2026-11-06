import type { NeuronDetail } from '#lib/server/neuron/get-detail';
import type { RegionOverview } from '#lib/server/neuron/region-overview';

import { resolve } from '$app/paths';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('neuron-panel');

export interface NeuronPanelContext {
    readonly selected: NeuronDetail | null;
    readonly region: RegionOverview | null;
    openRegion(id: string): Promise<void>;
    close(): void;
    consumeTrigger(): boolean;
    open(id: string): Promise<void>;
}

export function createNeuronPanelContext(): NeuronPanelContext {
    let selected = $state<NeuronDetail | null>(null);
    let region = $state<RegionOverview | null>(null);
    let requestId = 0;
    let justTriggered = false;

    async function open(id: string) {
        justTriggered = true;

        const currentRequest = ++requestId;
        const href = resolve('/neurons/[id]/panel', { id });
        const response = await fetch(href).catch(() => null);

        if (response?.ok) {
            const result = (await response.json()) as NeuronDetail;
            if (currentRequest !== requestId) return;
            region = null;
            selected = result;
        }
    }

    async function openRegion(id: string) {
        justTriggered = true;
        const currentRequest = ++requestId;
        const href = resolve('/neurons/regions/[id]/panel', { id });
        const response = await fetch(href).catch(() => null);
        if (response?.ok) {
            const result = (await response.json()) as RegionOverview;
            if (currentRequest !== requestId) return;
            selected = null;
            region = result;
        }
    }

    function close() {
        requestId++;
        selected = null;
        region = null;
    }

    function consumeTrigger() {
        const value = justTriggered;
        justTriggered = false;
        return value;
    }

    const context: NeuronPanelContext = {
        get selected() {
            return selected;
        },
        get region() {
            return region;
        },
        openRegion,
        close,
        consumeTrigger,
        open,
    };

    setContext(KEY, context);
    return context;
}

export function getNeuronPanelContext(): NeuronPanelContext {
    const context = getContext<NeuronPanelContext | undefined>(KEY);
    if (!context) throw new Error('NeuronPanelContext not found');
    return context;
}
