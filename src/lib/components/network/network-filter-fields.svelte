<script lang="ts">
    import type { NetworkFilters } from '#lib/network/filters';
    import type { NetworkData } from '#lib/network/types';

    import { Select, SelectContent, SelectItem, SelectTrigger } from '#lib/components/ui/select';
    import { ENDORSEMENT_LEVELS, GROUNDING_LEVELS } from '#lib/neuron/schema';

    let {
        regions,
        filters = $bindable(),
    }: { regions: NetworkData['regions']; filters: NetworkFilters } = $props();

    const displayLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

    const fields = $derived([
        {
            key: 'region' as const,
            label: 'Region',
            options: regions.map((region) => ({ value: region.id, label: region.title })),
        },
        {
            key: 'grounding' as const,
            label: 'Grounding',
            options: GROUNDING_LEVELS.map((value) => ({ value, label: displayLabel(value) })),
        },
        {
            key: 'endorsement' as const,
            label: 'Review status',
            options: ENDORSEMENT_LEVELS.map((value) => ({ value, label: displayLabel(value) })),
        },
    ]);
</script>

<div class="space-y-1 px-2 py-2">
    {#each fields as field (field.key)}
        <div class="flex min-w-0 items-center gap-3">
            <span class="w-20 shrink-0 pl-1 text-xs text-muted-foreground">{field.label}</span>
            <Select type="single" bind:value={filters[field.key]}>
                <SelectTrigger
                    aria-label={`Filter by ${field.label.toLowerCase()}`}
                    size="sm"
                    class="h-7 min-w-0 flex-1 border-transparent px-2 text-xs shadow-none hover:bg-accent [&>span]:truncate"
                >
                    <span>
                        {field.options.find((option) => option.value === filters[field.key])
                            ?.label ?? 'Any'}
                    </span>
                </SelectTrigger>
                <SelectContent align="end">
                    <SelectItem value="" label="Any" />

                    {#each field.options as option (option.value)}
                        <SelectItem value={option.value} label={option.label} />
                    {/each}
                </SelectContent>
            </Select>
        </div>
    {/each}
</div>
