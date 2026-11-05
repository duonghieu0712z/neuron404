<script lang="ts">
    import type { PageProps } from './$types';

    import { enhance } from '$app/forms';

    import { Button } from '#lib/components/ui/button';
    import { Input } from '#lib/components/ui/input';
    import { Label } from '#lib/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger } from '#lib/components/ui/select';
    import { Textarea } from '#lib/components/ui/textarea';
    import { ENDORSEMENT_LEVELS, GROUNDING_LEVELS, PROVENANCE_SOURCES } from '#lib/neuron/schema';

    let { form, data }: PageProps = $props();

    let grounding = $state<string>(GROUNDING_LEVELS[0]);
    let endorsement = $state<string>(ENDORSEMENT_LEVELS[0]);
    let provenance = $state<string>(PROVENANCE_SOURCES[0]);
    let submitting = $state(false);
    let topic = $state('');
</script>

<svelte:head>
    <title>New neuron · neuron404</title>
</svelte:head>

<section class="w-full max-w-2xl space-y-6 p-6">
    <h1 class="text-2xl font-semibold">New neuron</h1>

    <form
        method="post"
        class="space-y-4"
        use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
                await update();
                submitting = false;
            };
        }}
    >
        <div class="space-y-1.5">
            <Label for="title">
                Title <span aria-hidden="true" class="text-destructive">*</span>
            </Label>
            <Input
                id="title"
                name="title"
                required
                aria-describedby={form?.errors?.title ? 'title-error' : undefined}
            />
            {#if form?.errors?.title}
                <p id="title-error" class="text-xs text-destructive">{form.errors.title[0]}</p>
            {/if}
        </div>

        <div class="space-y-1.5">
            <Label for="body">
                Content <span aria-hidden="true" class="text-destructive">*</span>
            </Label>
            <Textarea
                id="body"
                name="body"
                rows={8}
                required
                aria-describedby={form?.errors?.body ? 'body-error' : undefined}
            />
            {#if form?.errors?.body}
                <p id="body-error" class="text-xs text-destructive">{form.errors.body[0]}</p>
            {/if}
        </div>

        <div class="space-y-1.5">
            <Label for="topic">Region</Label>
            <Select type="single" name="topic" bind:value={topic}>
                <SelectTrigger id="topic" class="w-full">
                    {data.topics.find((item) => item.id === topic)?.title ?? 'Unfiled'}
                </SelectTrigger>
                <SelectContent>
                    {#each data.topics as item (item.id)}
                        <SelectItem value={item.id} label={item.title} />
                    {/each}
                </SelectContent>
            </Select>
            {#if form?.errors?.topics}<p class="text-xs text-destructive">
                    {form.errors.topics[0]}
                </p>{/if}
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

        <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
        </Button>
    </form>
</section>
