<script lang="ts">
    import type { PageProps } from './$types';

    import { resolve } from '$app/paths';

    import { Button } from '#lib/components/ui/button';
    import { Card, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card';

    let { data }: PageProps = $props();
</script>

<section class="mx-auto max-w-3xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">Lint / Verify</h1>
        <Button href={resolve('/neurons')} variant="outline">Back to neurons</Button>
    </header>

    {#if data.issues.length === 0}
        <p class="text-sm text-muted-foreground">No issues found.</p>
    {:else}
        <div class="space-y-3">
            {#each data.issues as issue, index (index)}
                <Card>
                    <CardHeader>
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
                        <CardDescription>
                            <span class="font-mono text-xs uppercase">{issue.kind}</span> — {issue.message}
                        </CardDescription>
                    </CardHeader>
                </Card>
            {/each}
        </div>
    {/if}
</section>
