<script lang="ts">
    import type { ReviewView } from '#lib/neuron/review';

    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

    import DetailSection from '#lib/components/detail-section.svelte';
    import ReviewEvidence from '#lib/components/review-evidence.svelte';
    import { Badge } from '#lib/components/ui/badge';
    import { Button } from '#lib/components/ui/button';
    import {
        Collapsible,
        CollapsibleContent,
        CollapsibleTrigger,
    } from '#lib/components/ui/collapsible';

    let {
        reports,
        onSelectNeuron,
    }: { reports: ReviewView[]; onSelectNeuron?: (id: string) => void } = $props();
</script>

{#each reports as report (report.id)}
    <DetailSection
        title={report.kind === 'overview' ? 'Overview fidelity' : 'Knowledge review'}
        count={report.findings.length}
        open={false}
    >
        {#snippet summary()}
            <div class="flex flex-wrap gap-1.5">
                <Badge variant="outline">
                    {report.verdict === 'pass' ? 'Checks passed' : 'Needs review'}
                </Badge>
                {#if report.stale}<Badge variant="outline">Inputs changed</Badge>{/if}
                {#if report.kind === 'overview' && !report.appliesToCurrentOverview}
                    <Badge variant="outline">Different overview revision</Badge>
                {/if}
            </div>
        {/snippet}
        <div class="space-y-3">
            <p class="text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
            <p class="text-xs text-muted-foreground">
                {report.createdAt.slice(0, 10)} · Checked against supplied evidence, not independent confirmation
                of truth.
            </p>
            <p class="text-xs leading-relaxed text-muted-foreground">{report.coverage}</p>

            {#each report.findings as finding (finding.id)}
                <section class="space-y-2 border-t pt-3 text-xs leading-relaxed">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{finding.kind}</Badge>
                        <span class="text-muted-foreground">
                            {finding.severity} · {finding.status}
                        </span>
                        {#if finding.carriedForward}<span class="text-muted-foreground">
                                Carried forward
                            </span>{/if}
                    </div>
                    <p>{finding.explanation}</p>
                    <p class="text-muted-foreground">{finding.suggestion}</p>
                    {#if finding.synapse}
                        <p class="break-all text-muted-foreground">
                            Proposed {finding.synapse.kind}: {finding.synapse.source} → {finding
                                .synapse.target}
                        </p>
                    {/if}
                    <ReviewEvidence
                        evidence={finding.evidence}
                        details={report.evidenceDetails}
                        {onSelectNeuron}
                    />
                    {#if finding.note}<p class="text-muted-foreground">
                            Decision: {finding.note}
                        </p>{/if}
                </section>
            {/each}
            <Collapsible class="group">
                <CollapsibleTrigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="sm"
                            class="h-7 w-full justify-between bg-transparent! px-0 text-xs"
                        >
                            <span>Evidence checks · {report.checks.length}</span>
                            <ChevronDownIcon
                                class="size-3 transition-transform group-data-[state=open]:rotate-180"
                            />
                        </Button>
                    {/snippet}
                </CollapsibleTrigger>
                <CollapsibleContent class="space-y-3 pt-2">
                    {#each report.checks as check (check.subject)}
                        <section class="space-y-1 text-xs leading-relaxed">
                            <p class="font-medium break-all">{check.subject} · {check.verdict}</p>
                            <p class="text-muted-foreground">{check.reason}</p>
                            <ReviewEvidence
                                evidence={check.evidence}
                                details={report.evidenceDetails}
                                {onSelectNeuron}
                            />
                        </section>
                    {/each}
                </CollapsibleContent>
            </Collapsible>
            <p class="text-[10px] break-all text-muted-foreground">Report {report.id}</p>
        </div>
    </DetailSection>
{/each}
