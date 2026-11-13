import type { SimulationNodeDatum } from 'd3-force';

export interface NetworkNode extends SimulationNodeDatum {
    id: string;
    regions?: string[];
    regionId?: string;
}
