import type { buildNetworkModel } from './model';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

export type NetworkData = ReturnType<typeof buildNetworkModel>;

export type NetworkTheme = 'dark' | 'light';

export type NetworkPositions = Record<string, { x: number; y: number } | undefined>;

export type SimNode = NetworkData['nodes'][number] & SimulationNodeDatum & { regionId?: string };

export interface SimLink extends SimulationLinkDatum<SimNode> {
    kind: string;
    sourceId: string;
    targetId: string;
}
