<script lang="ts">
    import type { LayoutProps } from './$types';

    import MoonIcon from '@lucide/svelte/icons/moon';
    import SunIcon from '@lucide/svelte/icons/sun';
    import { resolve } from '$app/paths';
    import { ModeWatcher, toggleMode } from 'mode-watcher';

    import iconDark from '#lib/assets/icon-dark.svg';
    import iconLight from '#lib/assets/icon-light.svg';
    import { Button } from '#lib/components/ui/button';

    import './layout.css';

    let { children }: LayoutProps = $props();
</script>

<svelte:head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<ModeWatcher />

<header class="border-b">
    <div class="mx-auto flex max-w-3xl items-center justify-between p-4">
        <a href={resolve('/neurons')} class="flex items-center gap-2 font-semibold">
            <img src={iconLight} alt="" class="size-5 dark:hidden" />
            <img src={iconDark} alt="" class="hidden size-5 dark:block" />
            neuron404
        </a>
        <Button onclick={toggleMode} variant="ghost" size="icon" aria-label="Toggle theme">
            <SunIcon class="size-4 dark:hidden" />
            <MoonIcon class="hidden size-4 dark:block" />
        </Button>
    </div>
</header>

{@render children()}
