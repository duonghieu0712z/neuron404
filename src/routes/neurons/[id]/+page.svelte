<script lang="ts">
    import type { PageProps } from './$types';

    import NeuronDetail from '#lib/components/neuron-detail.svelte';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>{data.neuron.title} · neuron404</title>
</svelte:head>

<article class="w-full space-y-6 p-6">
    <h1 class="text-2xl font-semibold">{data.neuron.title}</h1>

    <NeuronDetail {data} layout="full" />
</article>
