<script lang="ts">
    let {
        label,
        count,
        shape,
        color = 'currentColor',
    }: {
        label: string;
        count: number;
        shape: 'circle' | 'hexagon' | 'line' | 'dashed';
        color?: string;
    } = $props();

    const legendClasses = {
        dashed: 'w-4 border-t border-dashed',
        line: 'h-0.5 w-4',
        circle: 'size-2.5 rounded-full',
        hexagon: 'h-3 w-2.5',
    };
</script>

<div class="flex items-center gap-2 text-xs">
    <span class="flex w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span
            class={legendClasses[shape]}
            style:background-color={shape === 'dashed' ? undefined : color}
            style:border-color={shape === 'dashed' ? color : undefined}
            style:clip-path={shape === 'hexagon'
                ? 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)'
                : undefined}
        ></span>
    </span>
    <span class="min-w-0 flex-1 text-muted-foreground">{label}</span>
    <span class="tabular-nums">{count}</span>
</div>
