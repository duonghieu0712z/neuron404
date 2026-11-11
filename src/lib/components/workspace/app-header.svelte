<script lang="ts">
    import ListChecksIcon from '@lucide/svelte/icons/list-checks';
    import MoonIcon from '@lucide/svelte/icons/moon';
    import SunIcon from '@lucide/svelte/icons/sun';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { toggleMode } from 'mode-watcher';

    import iconDark from '#lib/assets/icon-dark.svg';
    import iconLight from '#lib/assets/icon-light.svg';
    import { Button } from '#lib/components/ui/button';
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

    import NeuronSearch from './neuron-search.svelte';

    let { authEnabled }: { authEnabled: boolean } = $props();

    const NAV_ITEMS = [
        { href: '/neurons', label: 'Neurons' },
        { href: '/network', label: 'Network' },
    ] as const;

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
            <NeuronSearch />
            {#if authEnabled}
                <form method="post" action={resolve('/logout')}>
                    <Button type="submit" variant="ghost" size="sm">Sign out</Button>
                </form>
            {/if}
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
