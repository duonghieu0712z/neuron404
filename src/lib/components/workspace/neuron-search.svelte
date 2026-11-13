<script lang="ts">
    import SearchIcon from '@lucide/svelte/icons/search';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { onDestroy } from 'svelte';
    import { SvelteURLSearchParams } from 'svelte/reactivity';

    import { Input } from '#lib/components/ui/input';

    let searchValue = $derived((page.shallow?.url ?? page.url).searchParams.get('q') ?? '');
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    function searchNeurons(event: Event) {
        searchValue = (event.currentTarget as HTMLInputElement).value;
        const pathname = page.url.pathname;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (page.url.pathname !== pathname) {
                return;
            }

            const params = new SvelteURLSearchParams();

            if (searchValue.trim()) {
                params.set('q', searchValue.trim());
            }

            const query = params.toString();

            if (pathname === resolve('/network')) {
                void goto(resolve(query ? `/network?${query}` : '/network'), {
                    shallow: true,
                    replace: true,
                    reset: false,
                    state: page.state,
                });
                return;
            }

            void goto(resolve(query ? `/neurons?${query}` : '/neurons'), {
                replace: page.url.pathname === '/neurons',
                reset: false,
            });
        }, 300);
    }

    onDestroy(() => clearTimeout(searchTimer));
</script>

<div class="relative max-w-72 min-w-20 flex-1">
    <SearchIcon
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
        type="search"
        aria-label="Search neurons"
        placeholder="Search neurons..."
        class="pl-9"
        value={searchValue}
        oninput={searchNeurons}
    />
</div>
