<script lang="ts">
    import XIcon from '@lucide/svelte/icons/x';

    import DetailSection from '#lib/components/neuron/detail-section.svelte';
    import { Button } from '#lib/components/ui/button';
    import { ScrollArea } from '#lib/components/ui/scroll-area';
    import { webHref } from '#lib/links';
    import { getNeuronPanelContext } from '#lib/neuron-panel.svelte';
    import { findSourceExcerpt } from '#lib/source/excerpt';

    const panel = getNeuronPanelContext();

    const snapshot = $derived(panel.source?.snapshot);
    const excerpt = $derived(
        snapshot ? findSourceExcerpt(snapshot.source.content, panel.source?.passage ?? '') : null,
    );
    const href = $derived(snapshot ? webHref(snapshot.source.uri) : null);
</script>

<section
    class="flex h-full min-h-0 flex-col border-l bg-background"
    aria-label="Source evidence"
    data-neuron-trigger
>
    <header class="flex items-center justify-between gap-2 border-b p-3">
        <h2 class="text-sm font-semibold">Source evidence</h2>
        <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close source"
            onclick={panel.closeSource}
        >
            <XIcon class="size-4" />
        </Button>
    </header>
    <ScrollArea class="min-h-0 flex-1">
        <div class="space-y-4 p-4 text-sm">
            {#if panel.source?.loading}
                <p role="status">Loading saved source…</p>
            {/if}

            {#if panel.source?.error}
                <p role="alert">{panel.source.error}</p>
            {/if}

            {#if snapshot}
                <h3 class="font-semibold">{snapshot.source.title}</h3>

                {#if href}
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Validated absolute HTTP(S) URL. -->
                    <a {href} target="_blank" rel="noopener noreferrer" class="break-all underline">
                        Open original source
                    </a>
                {:else}
                    <p class="break-all text-muted-foreground">{snapshot.source.uri}</p>
                {/if}

                {#if snapshot.source.locator}
                    <p class="text-muted-foreground">
                        {snapshot.source.locator}
                    </p>
                {/if}
                <p class="text-xs text-muted-foreground">Captured {snapshot.capturedAt}</p>

                {#if panel.source?.passage}
                    <div class="space-y-2 rounded-sm border p-3">
                        <h4 class="font-medium">Cited passage in neuron</h4>
                        <p class="whitespace-pre-wrap">{panel.source.passage}</p>
                    </div>
                {/if}

                {#if excerpt}
                    <div class="space-y-2 rounded-sm border p-3">
                        <h4 class="font-medium">Related passage in saved source</h4>
                        <p class="text-xs text-muted-foreground">
                            Suggested by matching words; compare the full source to verify the
                            claim.
                        </p>
                        <pre
                            class="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{excerpt}</pre>
                    </div>
                {/if}
                <DetailSection title="Saved raw source" open={false}>
                    <pre
                        class="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{snapshot
                            .source.content}</pre>
                </DetailSection>
            {/if}
        </div>
    </ScrollArea>
</section>
