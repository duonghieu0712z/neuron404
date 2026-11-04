import type { NeuronDetail } from '#lib/server/neuron/get-detail';

import { resolve } from '$app/paths';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('neuron-panel');

export interface NeuronPanelContext {
    readonly selected: NeuronDetail | null;
    close(): void;
    consumeTrigger(): boolean;
    open(id: string): Promise<void>;
}

export function createNeuronPanelContext(): NeuronPanelContext {
    let selected = $state<NeuronDetail | null>(null);
    let justTriggered = false;

    async function open(id: string) {
        justTriggered = true;

        const href = resolve('/neurons/[id]/panel', { id });
        const response = await fetch(href).catch(() => null);

        if (response?.ok) {
            selected = (await response.json()) as NeuronDetail;
        }
    }

    function close() {
        selected = null;
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
