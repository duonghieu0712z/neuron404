import type { NetworkSelection } from './selection';

import { tick, untrack } from 'svelte';

import { networkSelectionKey, networkSelectionUrl, readNetworkSelection } from './selection';

interface LocationOptions {
    url: () => URL;
    selection: () => NetworkSelection;
    ready: () => boolean;
    pending: () => boolean;
    restore: (selection: NetworkSelection) => Promise<boolean>;
    navigate: (url: URL) => Promise<void>;
}

export function createNetworkLocation(options: LocationOptions) {
    let initialized = $state(false);
    let restoring = $state(false);
    let error = $state<string | null>(null);
    let observed: string | undefined;
    let generation = 0;
    let disposed = false;
    let writing = false;
    let writingKey: string | null = null;
    let queued: NetworkSelection | null = null;
    let currentLocation: URL | null = null;

    async function writeSelection(selection: NetworkSelection) {
        queued = selection;
        if (writing) {
            return;
        }
        writing = true;
        try {
            while (queued && !disposed) {
                const next = queued;
                queued = null;
                const key = networkSelectionKey(next);
                if (key === networkSelectionKey(readNetworkSelection(options.url()))) {
                    continue;
                }
                writingKey = key;
                try {
                    await options.navigate(
                        networkSelectionUrl(currentLocation ?? options.url(), next),
                    );
                    await tick();
                } finally {
                    writingKey = null;
                }
            }
        } catch {
            queued = null;
            if (!disposed) {
                error = 'Could not update the link to this view.';
            }
        } finally {
            writing = false;
        }
    }

    $effect(() => () => {
        disposed = true;
        generation++;
        queued = null;
    });

    $effect(() => {
        if (!options.ready()) {
            return;
        }
        const url = options.url();
        const selection = readNetworkSelection(url);
        const key = networkSelectionKey(selection);
        if (key === writingKey) {
            if (key !== observed && !untrack(() => restoring)) {
                void untrack(() => writeSelection(options.selection()));
            }
            return;
        }
        currentLocation = url;
        if (key === observed) {
            return;
        }
        observed = key;
        if (untrack(() => initialized && key === networkSelectionKey(options.selection()))) {
            return;
        }
        queued = null;
        const current = ++generation;
        restoring = true;
        error = null;
        void untrack(() => options.restore(selection))
            .catch(() => {
                if (!disposed && current === generation) {
                    error = 'Could not restore the selected knowledge.';
                }
            })
            .finally(() => {
                if (!disposed && current === generation) {
                    initialized = true;
                    restoring = false;
                }
            });
    });

    $effect(() => {
        if (!initialized || restoring || options.pending()) {
            return;
        }
        const selection = options.selection();
        const key = networkSelectionKey(selection);
        observed = key;
        if (
            key === networkSelectionKey(readNetworkSelection(untrack(options.url))) ||
            key === writingKey ||
            (queued && key === networkSelectionKey(queued))
        ) {
            return;
        }
        void untrack(() => writeSelection(selection));
    });

    return {
        get error() {
            return error;
        },
    };
}
