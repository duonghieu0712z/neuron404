<script lang="ts">
    import type { LayoutProps } from './$types';

    import favicon from '#lib/assets/favicon.svg';

    import './layout.css';

    let { children }: LayoutProps = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
