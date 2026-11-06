import { getRegionNodeId } from './region-node';

export type MembershipMode = 'hidden' | 'auto' | 'all';

export const MEMBERSHIP_MODES = [
    { value: 'hidden', label: 'Hidden' },
    { value: 'auto', label: 'Automatic' },
    { value: 'all', label: 'Show all' },
] as const;

export function isMembershipMode(value: unknown): value is MembershipMode {
    return MEMBERSHIP_MODES.some((mode) => mode.value === value);
}

export function getVisibleMembershipLinks(
    regions: { id: string; nodeIds: string[] }[],
    mode: MembershipMode,
    active: string | null,
    selected: string | null,
) {
    if (mode === 'hidden') {
        return [];
    }
    return regions.flatMap((region) => {
        const center = getRegionNodeId(region.id);
        const activeRegion = active === center;
        const selectedRegion = selected === center;
        return region.nodeIds
            .filter(
                (id) =>
                    mode === 'all' ||
                    activeRegion ||
                    selectedRegion ||
                    id === active ||
                    id === selected,
            )
            .map((id) => ({
                source: center,
                target: id,
                emphasized:
                    activeRegion ||
                    id === active ||
                    (!active && (selectedRegion || id === selected)),
            }));
    });
}
