import type { LabelPlacement } from './labels';
import type { MembershipMode } from './membership';
import type { MembershipLink } from './membership-hover';
import type { NetworkData } from './types';

import { labelBox } from './labels';
import { getRegionNodeId } from './region-node';

export function createRenderState(data: NetworkData, membership: MembershipMode) {
    const regionByNodeId = new Map(
        data.regions.map((region) => [getRegionNodeId(region.id), region]),
    );

    const state = {
        activeNode: null as string | null,
        activeEdge: null as string | null,
        activeMembership: null as MembershipLink | null,
        edgeEndpoints: new Set<string>(),
        selectedNode: null as string | null,
        neuronLabelsVisible: true,
        visibleMembershipMode: membership,
        neighborhood: new Set<string>(),
        searchMatches: null as Set<string> | null,
        labelPlacements: new Map<string, LabelPlacement>(),
        signalLabelMasks: [] as ReturnType<typeof labelBox>[],
        compactLabels: Object.create(null) as Record<string, string | undefined>,
        regionByNodeId,
        matchesSearch(id: string): boolean {
            const matches = state.searchMatches;

            if (!matches) {
                return true;
            }

            const region = regionByNodeId.get(id);
            return region ? region.nodeIds.some((member) => matches.has(member)) : matches.has(id);
        },
        focusPriority(id: string) {
            if (state.edgeEndpoints.has(id) || id === state.activeNode) {
                return 3;
            }

            if (id === state.selectedNode) {
                return 2;
            }

            return regionByNodeId.has(id) ? 1 : 0;
        },
    };
    return state;
}

export type RenderState = ReturnType<typeof createRenderState>;
