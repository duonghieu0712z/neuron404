import type { NetworkData } from './types';

import { resolve } from '$app/paths';
import { SvelteSet } from 'svelte/reactivity';

export function createNetworkSearch(getQuery: () => string, getNodes: () => NetworkData['nodes']) {
    let matchingNodeIds = $state.raw<Set<string> | null>(null);
    let searching = $state(false);
    let searchError = $state<string | null>(null);

    $effect(() => {
        const query = getQuery();
        const nodes = getNodes();
        searchError = null;

        if (!query) {
            matchingNodeIds = null;
            searching = false;
            return;
        }

        const controller = new AbortController();
        matchingNodeIds = new SvelteSet();
        searching = true;
        void (async () => {
            try {
                const response = await fetch(
                    resolve(`/network/search?q=${encodeURIComponent(query)}`),
                    { signal: controller.signal },
                );

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(
                        response.status === 400 ? result.message : 'Search is unavailable.',
                    );
                }

                if (
                    !Array.isArray(result.ids) ||
                    !result.ids.every((id: unknown) => typeof id === 'string')
                ) {
                    throw new Error('Search is unavailable.');
                }

                if (controller.signal.aborted) {
                    return;
                }

                const known = new SvelteSet(nodes.map((node) => node.id));
                matchingNodeIds = new SvelteSet<string>(
                    result.ids.filter((id: string) => known.has(id)),
                );
            } catch (cause) {
                if (controller.signal.aborted) {
                    return;
                }

                matchingNodeIds = null;
                searchError = cause instanceof Error ? cause.message : 'Search is unavailable.';
            } finally {
                if (!controller.signal.aborted) {
                    searching = false;
                }
            }
        })();
        return () => controller.abort();
    });

    return {
        get ids() {
            return matchingNodeIds;
        },
        get searching() {
            return searching;
        },
        get error() {
            return searchError;
        },
    };
}
