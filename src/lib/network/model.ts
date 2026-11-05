import type { Neuron, Region, Synapse } from '#lib/neuron/schema';

export interface NetworkNodeData {
    id: string;
    title: string;
    grounding: string;
    regions: string[];
}

export interface NetworkEdgeData {
    source: string;
    target: string;
    kind: Synapse['kind'];
}

export function buildNetworkModel(neurons: Neuron[], regions: Region[]) {
    const nodes: NetworkNodeData[] = neurons.map(({ id, title, grounding, topics }) => ({
        id,
        title,
        grounding,
        regions: topics,
    }));
    const ids = new Set(nodes.map((node) => node.id));
    const regionIds = new Set(regions.map((region) => region.id));
    for (const node of nodes) {
        for (const id of node.regions) {
            if (!regionIds.has(id)) throw new Error(`Unknown region "${id}" on neuron ${node.id}`);
        }
    }
    const edges: NetworkEdgeData[] = neurons.flatMap((neuron) =>
        neuron.synapses
            .filter((edge) => ids.has(edge.target))
            .map((edge) => ({ source: neuron.id, target: edge.target, kind: edge.kind })),
    );
    const populatedRegions = regions
        .map((region) => ({
            ...region,
            nodeIds: nodes
                .filter((node) => node.regions.includes(region.id))
                .map((node) => node.id),
        }))
        .filter((region) => region.nodeIds.length > 0);
    const unfiled = nodes.filter((node) => node.regions.length === 0).map((node) => node.id);
    if (unfiled.length)
        populatedRegions.push({
            id: 'region:unfiled',
            title: 'Unfiled',
            description: 'Neurons without a region.',
            nodeIds: unfiled,
        });
    return {
        nodes,
        edges,
        regions: populatedRegions,
        neuronCount: nodes.length,
        synapseCount: edges.length,
    };
}
