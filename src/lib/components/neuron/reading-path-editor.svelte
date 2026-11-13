<script lang="ts">
    import type { readReadingPath } from '#lib/server/neuron/reading-path';

    import { enhance } from '$app/forms';

    import { Button } from '#lib/components/ui/button';
    import { Input } from '#lib/components/ui/input';
    import { Textarea } from '#lib/components/ui/textarea';

    let {
        path,
        members,
    }: {
        path: Awaited<ReturnType<typeof readReadingPath>>;
        members: { id: string; title: string }[];
    } = $props();

    let introduction = $state('');
    let steps = $state<{ id: string; purpose: string }[]>([]);
    let saving = $state(false);

    const available = $derived(
        members.filter((member) => !steps.some((step) => step.id === member.id)),
    );

    $effect(() => {
        introduction = path.introduction;
        steps = path.steps
            .filter((step) => members.some((member) => member.id === step.id))
            .map((step) => ({ ...step }));
    });

    function move(index: number, offset: number) {
        const copy = [...steps];

        [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
        steps = copy;
    }
</script>

<form
    method="post"
    action="?/save"
    class="space-y-4"
    use:enhance={() => {
        saving = true;

        return async ({ update }) => {
            try {
                await update({ reset: false });
            } finally {
                saving = false;
            }
        };
    }}
>
    <input type="hidden" name="revision" value={path.revision ?? ''} />
    <label class="block space-y-2 text-sm">
        <span>Introduction</span>
        <Textarea
            name="introduction"
            bind:value={introduction}
            placeholder="Explain where to start and what this reading path covers."
        />
    </label>
    <ol class="space-y-3">
        {#each steps as step, index (step.id)}
            <li class="space-y-2 rounded-sm border p-3">
                <input type="hidden" name="step" value={step.id} />
                <p class="text-sm font-medium">
                    {index + 1}. {members.find((member) => member.id === step.id)?.title ?? step.id}
                </p>
                <Input
                    name={`purpose-${index}`}
                    bind:value={step.purpose}
                    aria-label={`Reading guidance for step ${index + 1}`}
                    placeholder="What to learn from this step"
                />
                <div class="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={index === 0}
                        onclick={() => move(index, -1)}
                    >
                        Move up
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={index === steps.length - 1}
                        onclick={() => move(index, 1)}
                    >
                        Move down
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onclick={() => {
                            steps = steps.filter((item) => item.id !== step.id);
                        }}
                    >
                        Remove
                    </Button>
                </div>
            </li>
        {/each}
    </ol>
    <div class="flex flex-wrap gap-2">
        {#each available as member (member.id)}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onclick={() => {
                    steps = [...steps, { id: member.id, purpose: '' }];
                }}
            >
                Add: {member.title}
            </Button>
        {/each}
    </div>
    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save reading path'}</Button>
</form>
