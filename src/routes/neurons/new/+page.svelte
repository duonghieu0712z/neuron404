<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Button } from '#lib/components/ui/button';
    import { Input } from '#lib/components/ui/input';
    import { Label } from '#lib/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger } from '#lib/components/ui/select';
    import { Textarea } from '#lib/components/ui/textarea';
    import { ENDORSEMENT_LEVELS, GROUNDING_LEVELS, PROVENANCE_SOURCES } from '#lib/neuron/schema';

    let { form }: PageProps = $props();

    let grounding = $state<string>(GROUNDING_LEVELS[0]);
    let endorsement = $state<string>(ENDORSEMENT_LEVELS[0]);
    let provenance = $state<string>(PROVENANCE_SOURCES[0]);
</script>

<section class="mx-auto max-w-3xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">New neuron</h1>
        <Button href={resolve('/neurons')} variant="outline">Back to neurons</Button>
    </header>

    <form method="post" class="space-y-4">
        <div class="space-y-1.5">
            <Label for="title">Title</Label>
            <Input id="title" name="title" required />
            {#if form?.errors?.title}
                <p class="text-xs text-destructive">{form.errors.title[0]}</p>
            {/if}
        </div>

        <div class="space-y-1.5">
            <Label for="body">Content</Label>
            <Textarea id="body" name="body" rows={8} required />
            {#if form?.errors?.body}
                <p class="text-xs text-destructive">{form.errors.body[0]}</p>
            {/if}
        </div>

        <div class="grid grid-cols-3 gap-4">
            <div class="space-y-1.5">
                <Label for="grounding">Grounding</Label>
                <Select type="single" name="grounding" bind:value={grounding}>
                    <SelectTrigger id="grounding" class="w-full">
                        {grounding}
                    </SelectTrigger>
                    <SelectContent>
                        {#each GROUNDING_LEVELS as level (level)}
                            <SelectItem value={level} label={level} />
                        {/each}
                    </SelectContent>
                </Select>
            </div>
            <div class="space-y-1.5">
                <Label for="endorsement">Endorsement</Label>
                <Select type="single" name="endorsement" bind:value={endorsement}>
                    <SelectTrigger id="endorsement" class="w-full">
                        {endorsement}
                    </SelectTrigger>
                    <SelectContent>
                        {#each ENDORSEMENT_LEVELS as level (level)}
                            <SelectItem value={level} label={level} />
                        {/each}
                    </SelectContent>
                </Select>
            </div>
            <div class="space-y-1.5">
                <Label for="provenance">Provenance</Label>
                <Select type="single" name="provenance" bind:value={provenance}>
                    <SelectTrigger id="provenance" class="w-full">
                        {provenance}
                    </SelectTrigger>
                    <SelectContent>
                        {#each PROVENANCE_SOURCES as source (source)}
                            <SelectItem value={source} label={source} />
                        {/each}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <Button type="submit">Create</Button>
    </form>
</section>
