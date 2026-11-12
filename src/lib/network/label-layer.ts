import type { RenderState } from './render-state';
import type Sigma from 'sigma';

import { LABEL_MAX_WIDTH } from './appearance';
import { chooseLabelPlacements, labelBox } from './labels';

export function createLabelLayer(
    sigmaInstance: Sigma,
    state: RenderState,
    regionContext: CanvasRenderingContext2D | null,
) {
    const network = sigmaInstance.getGraph();
    const labelWidths: Record<string, number | undefined> = Object.create(null);

    const measureLabel = (label: string) => {
        let width = labelWidths[label];

        if (width === undefined) {
            width = regionContext?.measureText(label).width ?? Array.from(label).length * 8;
            labelWidths[label] = width;
        }

        return width;
    };

    const layoutLabels = () => {
        sigmaInstance.resize();
        const { width, height } = sigmaInstance.getDimensions();
        const cameraState = sigmaInstance.getCamera().getState();

        if (regionContext) {
            regionContext.font = '12px "Inter Variable", sans-serif';
        }

        const textChanged: string[] = [];

        const candidates = network
            .nodes()
            .filter(
                (id) =>
                    !sigmaInstance.getNodeState(id).isHidden &&
                    (state.activeEdge || state.activeMembership
                        ? state.edgeEndpoints.has(id)
                        : state.regionByNodeId.has(id) ||
                          id === state.activeNode ||
                          id === state.selectedNode ||
                          (state.neuronLabelsVisible &&
                              state.matchesSearch(id) &&
                              (state.searchMatches !== null ||
                                  !state.activeNode ||
                                  state.neighborhood.has(id) ||
                                  id === state.selectedNode))),
            )
            .map((id) => {
                const attributes = network.getNodeAttributes(id);
                const isRegion = state.regionByNodeId.has(id);
                const expanded =
                    state.edgeEndpoints.has(id) ||
                    isRegion ||
                    id === state.activeNode ||
                    id === state.selectedNode;

                if (state.compactLabels[id] === undefined) {
                    let compact: string = attributes.shortLabel;

                    if (measureLabel(compact) > LABEL_MAX_WIDTH) {
                        const characters = Array.from(compact.replace(/\.{3}$/, ''));
                        do {
                            characters.pop();
                            compact = `${characters.join('').trimEnd()}...`;
                        } while (characters.length && measureLabel(compact) > LABEL_MAX_WIDTH);
                    }

                    state.compactLabels[id] = compact;
                    textChanged.push(id);
                }

                const label = expanded ? attributes.label : state.compactLabels[id]!;

                const position = sigmaInstance.graphToViewport(
                    { x: attributes.x, y: attributes.y },
                    { cameraState },
                );

                return {
                    id,
                    ...position,
                    width: measureLabel(label),
                    radius: sigmaInstance.scaleSize(attributes.size),
                    required: expanded,
                    priority: state.focusPriority(id),
                };
            });

        const next = chooseLabelPlacements(candidates, width, height);
        state.signalLabelMasks = candidates
            .filter((candidate) => next.has(candidate.id))
            .map((candidate) => labelBox(candidate, next.get(candidate.id)!));
        const changed = network
            .nodes()
            .filter(
                (id) => textChanged.includes(id) || next.get(id) !== state.labelPlacements.get(id),
            );
        state.labelPlacements = next;

        if (changed.length) {
            sigmaInstance.refresh({
                partialGraph: { nodes: changed },
                skipIndexation: true,
                schedule: true,
            });
        }
    };

    sigmaInstance.on('beforeRender', layoutLabels);
    let disposed = false;
    void document.fonts.ready.then(() => {
        if (disposed) {
            return;
        }

        for (const label of Object.keys(labelWidths)) {
            delete labelWidths[label];
        }

        for (const id of Object.keys(state.compactLabels)) {
            delete state.compactLabels[id];
        }

        sigmaInstance.scheduleRender();
    });

    return () => {
        disposed = true;
        sigmaInstance.off('beforeRender', layoutLabels);
    };
}
