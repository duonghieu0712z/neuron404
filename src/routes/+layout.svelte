<script lang="ts">
    import type { LayoutProps } from './$types';

    import ListChecksIcon from '@lucide/svelte/icons/list-checks';
    import MoonIcon from '@lucide/svelte/icons/moon';
    import SearchIcon from '@lucide/svelte/icons/search';
    import SunIcon from '@lucide/svelte/icons/sun';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { ModeWatcher, toggleMode } from 'mode-watcher';
    import { onDestroy } from 'svelte';
    import { SvelteURLSearchParams } from 'svelte/reactivity';

    import iconDark from '#lib/assets/icon-dark.svg';
    import iconLight from '#lib/assets/icon-light.svg';
    import NeuronWorkspace from '#lib/components/neuron-workspace.svelte';
    import { Button } from '#lib/components/ui/button';
    import { Input } from '#lib/components/ui/input';
    import {
        NavigationMenu,
        NavigationMenuItem,
        NavigationMenuLink,
        NavigationMenuList,
        navigationMenuTriggerStyle,
    } from '#lib/components/ui/navigation-menu';
    import {
        Tooltip,
        TooltipContent,
        TooltipProvider,
        TooltipTrigger,
    } from '#lib/components/ui/tooltip';
    import { createNeuronPanelContext } from '#lib/neuron-panel.svelte';

    import './layout.css';

    let { children }: LayoutProps = $props();

    createNeuronPanelContext();

    const NAV_ITEMS = [
        { href: '/neurons', label: 'Neurons' },
        { href: '/network', label: 'Network' },
    ] as const;

    let searchValue = $derived((page.shallow?.url ?? page.url).searchParams.get('q') ?? '');
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    function searchNeurons(event: Event) {
        searchValue = (event.currentTarget as HTMLInputElement).value;
        const pathname = page.url.pathname;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (page.url.pathname !== pathname) return;
            const params = new SvelteURLSearchParams();
            if (searchValue.trim()) params.set('q', searchValue.trim());
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

    function isActive(href: string): boolean {
        if (href === '/neurons') {
            return (
                page.url.pathname === '/neurons' ||
                (page.url.pathname.startsWith('/neurons/') &&
                    !page.url.pathname.startsWith('/neurons/lint') &&
                    !page.url.pathname.startsWith('/neurons/new'))
            );
        }
        return page.url.pathname.startsWith(href);
    }
</script>

<svelte:head>
    <title>neuron404</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<ModeWatcher />

<a
    href="#main-content"
    class="sr-only rounded-sm bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
>
    Skip to main content
</a>

<header
    class="sticky top-0 z-10 flex h-14 w-full items-center gap-2 border-b bg-background px-3 sm:gap-6 sm:px-6"
>
    <a href={resolve('/neurons')} class="flex shrink-0 items-center gap-2 text-lg font-semibold">
        <img src={iconLight} alt="" class="size-6 dark:hidden" />
        <img src={iconDark} alt="" class="hidden size-6 dark:block" />
        neuron404
    </a>

    <NavigationMenu viewport={false}>
        <NavigationMenuList>
            {#each NAV_ITEMS as item (item.href)}
                <NavigationMenuItem>
                    <NavigationMenuLink
                        href={resolve(item.href)}
                        active={isActive(item.href)}
                        class={navigationMenuTriggerStyle()}
                    >
                        {item.label}
                    </NavigationMenuLink>
                </NavigationMenuItem>
            {/each}
        </NavigationMenuList>
    </NavigationMenu>

    <TooltipProvider>
        <div class="ml-auto flex min-w-0 items-center gap-2">
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
            <Button
                href={resolve('/neurons/new')}
                variant={isActive('/neurons/new') ? 'secondary' : 'default'}
            >
                New neuron
            </Button>
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            href={resolve('/neurons/lint')}
                            variant={isActive('/neurons/lint') ? 'secondary' : 'ghost'}
                            size="icon"
                            aria-label="Lint / Verify"
                        >
                            <ListChecksIcon class="size-4" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Lint / Verify</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            onclick={toggleMode}
                            variant="ghost"
                            size="icon"
                            aria-label="Toggle theme"
                        >
                            <SunIcon class="size-4 dark:hidden" />
                            <MoonIcon class="hidden size-4 dark:block" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</header>

<main id="main-content" class="h-[calc(100dvh-3.5rem)]">
    <NeuronWorkspace>
        {@render children()}
    </NeuronWorkspace>
</main>
