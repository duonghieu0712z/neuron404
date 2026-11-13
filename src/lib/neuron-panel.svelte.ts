import type { NeuronDetail } from '#lib/server/neuron/get-detail';
import type { RegionOverview } from '#lib/server/neuron/region-overview';
import type { readSource } from '#lib/server/neuron/sources';

import { resolve } from '$app/paths';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('neuron-panel');

export interface NeuronPanelContext {
    readonly source: {
        snapshot: Awaited<ReturnType<typeof readSource>> | null;
        passage: string;
        loading: boolean;
        error: string | null;
    } | null;
    openSource(id: string, passage?: string): Promise<void>;
    closeSource(): void;

    readonly selected: NeuronDetail | null;
    readonly region: RegionOverview | null;
    openRegion(id: string): Promise<void>;
    close(): void;
    open(id: string): Promise<void>;
}

export function createNeuronPanelContext(): NeuronPanelContext {
    let selected = $state<NeuronDetail | null>(null);
    let region = $state<RegionOverview | null>(null);

    let requestId = 0;
    let sourceRequest = 0;

    let source = $state<NeuronPanelContext['source']>(null);

    async function openSource(id: string, passage = '') {
        const currentRequest = ++sourceRequest;

        source = { snapshot: null, passage, loading: true, error: null };

        try {
            const response = await fetch(resolve('/sources/[id]', { id }));

            if (!response.ok || response.redirected) {
                throw new Error('Source is unavailable.');
            }

            const snapshot = await response.json();

            if (currentRequest === sourceRequest) {
                source = { snapshot, passage, loading: false, error: null };
            }
        } catch {
            if (currentRequest === sourceRequest) {
                source = {
                    snapshot: null,
                    passage,
                    loading: false,
                    error: 'Could not load the saved source.',
                };
            }
        }
    }

    function closeSource() {
        sourceRequest++;
        source = null;
    }

    async function open(id: string) {
        closeSource();

        const currentRequest = ++requestId;
        const href = resolve('/neurons/[id]/panel', { id });
        const response = await fetch(href).catch(() => null);

        if (response?.ok) {
            const result = (await response.json()) as NeuronDetail;

            if (currentRequest !== requestId) {
                return;
            }

            region = null;
            selected = result;
        }
    }

    async function openRegion(id: string) {
        closeSource();

        const currentRequest = ++requestId;
        const href = resolve('/neurons/regions/[id]/panel', { id });
        const response = await fetch(href).catch(() => null);

        if (response?.ok) {
            const result = (await response.json()) as RegionOverview;

            if (currentRequest !== requestId) {
                return;
            }

            selected = null;
            region = result;
        }
    }

    function close() {
        requestId++;
        closeSource();
        selected = null;
        region = null;
    }

    const context: NeuronPanelContext = {
        get source() {
            return source;
        },
        openSource,
        closeSource,
        get selected() {
            return selected;
        },
        get region() {
            return region;
        },
        openRegion,
        close,
        open,
    };

    setContext(KEY, context);

    return context;
}

export function getNeuronPanelContext(): NeuronPanelContext {
    const context = getContext<NeuronPanelContext | undefined>(KEY);

    if (!context) {
        throw new Error('NeuronPanelContext not found');
    }

    return context;
}
