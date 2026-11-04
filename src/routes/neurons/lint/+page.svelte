<script lang="ts">
    import type { PageProps } from './$types';
    import type { LintIssueKind } from '#lib/server/neuron/lint';

    import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
    import { resolve } from '$app/paths';

    import { Badge, type BadgeVariant } from '#lib/components/ui/badge';
    import { Card, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card';

    let { data }: PageProps = $props();

    const SEVERITY: Record<LintIssueKind, BadgeVariant> = {
        'dangling-synapse': 'destructive',
        'invalid-frontmatter': 'destructive',
        'isolated-neuron': 'secondary',
    };
</script>

<svelte:head>
    <title>Lint / Verify · neuron404</title>
</svelte:head>

<section class="w-full max-w-3xl space-y-6 p-6">
    <h1 class="text-2xl font-semibold">Lint / Verify</h1>

    {#if data.issues.length === 0}
        <div
            class="flex items-center gap-2 rounded-sm border border-dashed p-8 text-sm text-muted-foreground"
        >
            <CircleCheckIcon class="size-4" />
            No issues found.
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.issues as issue, index (index)}
                <Card size="sm">
                    <CardHeader class="gap-1.5">
                        <div class="flex items-center justify-between gap-2">
                            <CardTitle>
                                {#if issue.neuronId}
                                    <a
                                        href={resolve('/neurons/[id]', { id: issue.neuronId })}
                                        class="hover:underline"
                                    >
                                        {issue.fileName}
                                    </a>
                                {:else}
                                    {issue.fileName}
                                {/if}
                            </CardTitle>
                            <Badge variant={SEVERITY[issue.kind]}>{issue.kind}</Badge>
                        </div>
                        <CardDescription>{issue.message}</CardDescription>
                    </CardHeader>
                </Card>
            {/each}
        </div>
    {/if}
</section>
