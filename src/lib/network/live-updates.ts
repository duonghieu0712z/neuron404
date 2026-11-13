import type { NetworkData } from './types';

interface LiveUpdateOptions {
    url: string;
    revision: string;
    onUpdate: (network: NetworkData) => void;
    onError: (failed: boolean) => void;
}

const INTERVAL_MS = 2000;
const MAX_RETRY_MS = 30_000;

export function createNetworkLiveUpdates(options: LiveUpdateOptions) {
    let revision = options.revision;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let interacting = false;
    let retryMs = INTERVAL_MS;

    const schedule = () => {
        clearTimeout(timer);

        if (!disposed && !document.hidden) {
            timer = setTimeout(() => void refresh(), retryMs);
        }
    };

    const refresh = async () => {
        if (disposed || document.hidden || interacting || controller) {
            schedule();

            return;
        }

        controller = new AbortController();

        const signal = controller.signal;

        try {
            const response = await fetch(options.url, {
                headers: { 'If-None-Match': `"${revision}"` },
                cache: 'no-store',
                signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            });

            if (response.status !== 304) {
                if (!response.ok || response.redirected) {
                    throw new Error('Network updates are unavailable.');
                }

                const snapshot = (await response.json()) as {
                    network: NetworkData;
                    revision: string;
                };

                if (!signal.aborted && !disposed && !interacting) {
                    if (snapshot.revision !== revision) {
                        options.onUpdate(snapshot.network);
                        revision = snapshot.revision;
                    }
                }
            }

            if (!signal.aborted && !disposed) {
                retryMs = INTERVAL_MS;
                options.onError(false);
            }
        } catch {
            if (!signal.aborted && !disposed) {
                options.onError(true);
                retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
            }
        } finally {
            controller = null;
            schedule();
        }
    };

    const handleVisibility = () => {
        clearTimeout(timer);

        if (document.hidden) {
            controller?.abort();
            interacting = false;
        } else {
            void refresh();
        }
    };

    const startInteraction = () => {
        interacting = true;
    };

    const endInteraction = () => {
        if (interacting) {
            interacting = false;
            void refresh();
        }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('pointerdown', startInteraction);
    window.addEventListener('pointerup', endInteraction);
    window.addEventListener('pointercancel', endInteraction);
    window.addEventListener('blur', endInteraction);
    schedule();

    return {
        refresh,
        dispose() {
            disposed = true;
            clearTimeout(timer);
            controller?.abort();
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleVisibility);
            window.removeEventListener('pointerdown', startInteraction);
            window.removeEventListener('pointerup', endInteraction);
            window.removeEventListener('pointercancel', endInteraction);
            window.removeEventListener('blur', endInteraction);
        },
    };
}
