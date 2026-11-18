import type { RenderState } from './render-state';
import type Sigma from 'sigma';

import {
    EXPANDED_LABEL_MAX_WIDTH,
    LABEL_FONT_SIZE,
    LABEL_LINE_HEIGHT,
    LABEL_MAX_WIDTH,
} from './appearance';
import { wrapLabel } from './label-text';
import { chooseLabelPlacements, labelBox, type LabelPlacement } from './labels';

export function createLabelLayer(sigmaInstance: Sigma, state: RenderState) {
    const network = sigmaInstance.getGraph();
    const measureContext = document.createElement('canvas').getContext('2d');
    const labelWidths: Record<string, number | undefined> = Object.create(null);
    const wrappedLabels = new Map<string, ReturnType<typeof wrapLabel>>();
    let expandedPlacements = new Map<string, LabelPlacement>();

    const measureLabel = (label: string) => {
        let width = labelWidths[label];

        if (width === undefined) {
            width = measureContext?.measureText(label).width ?? Array.from(label).length * 8;
            labelWidths[label] = width;
        }

        return width;
    };

    const layoutLabels = () => {
        sigmaInstance.resize();
        const { width, height } = sigmaInstance.getDimensions();
        const cameraState = sigmaInstance.getCamera().getState();

        if (measureContext) {
            measureContext.font = '12px "Inter Variable", sans-serif';
        }

        const textChanged: string[] = [];
        const expandedMaxWidth = Math.min(EXPANDED_LABEL_MAX_WIDTH, Math.max(48, width - 32));

        const candidates = network
            .nodes()
            .filter(
                (id) =>
                    !sigmaInstance.getNodeState(id).isHidden &&
                    (state.activeEdge || state.activeMembership
                        ? state.edgeEndpoints.has(id) || id === state.selectedNode
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

                let label = state.compactLabels[id]!;
                let labelHeight = LABEL_FONT_SIZE;
                let labelWidth = measureLabel(label);
                let rasterized = false;

                if (expanded) {
                    const key = `${expandedMaxWidth}:${attributes.label}`;
                    let wrapped = wrappedLabels.get(key);

                    if (!wrapped) {
                        wrapped = wrapLabel(attributes.label, expandedMaxWidth, measureLabel);
                        wrappedLabels.set(key, wrapped);
                    }

                    label = wrapped.text;
                    labelWidth = wrapped.width;
                    rasterized = wrapped.lines > 1;
                    labelHeight = LABEL_FONT_SIZE + (wrapped.lines - 1) * LABEL_LINE_HEIGHT;

                    if (state.expandedLabels[id] !== label) {
                        state.expandedLabels[id] = label;
                        network.setNodeAttribute(id, 'labelContinuation', label);
                        network.setNodeAttribute(id, 'labelContinuationWidth', labelWidth);
                        network.setNodeAttribute(
                            id,
                            'labelContinuationAnchor',
                            label
                                .split('\n')
                                .reduce((longest, line) =>
                                    measureLabel(line) > measureLabel(longest) ? line : longest,
                                ),
                        );
                        textChanged.push(id);
                    }
                }

                const position = sigmaInstance.graphToViewport(
                    { x: attributes.x, y: attributes.y },
                    { cameraState },
                );

                return {
                    id,
                    ...position,
                    width: labelWidth,
                    height: labelHeight,
                    rasterized,
                    radius: sigmaInstance.scaleSize(attributes.size),
                    required: expanded,
                    selected: id === state.selectedNode,
                    priority: state.focusPriority(id),
                };
            });

        const next = chooseLabelPlacements(candidates, width, height, expandedPlacements);
        expandedPlacements = new Map(
            candidates
                .filter((candidate) => candidate.required && next.has(candidate.id))
                .map((candidate) => [candidate.id, next.get(candidate.id)!]),
        );
        state.signalLabelMasks = candidates
            .filter((candidate) => next.has(candidate.id))
            .map((candidate) => labelBox(candidate, next.get(candidate.id)!));
        state.expandedLabelAreas = new Map(
            candidates
                .filter(
                    (candidate) =>
                        candidate.required &&
                        next.has(candidate.id) &&
                        state.expandedLabels[candidate.id]?.includes('\n'),
                )
                .sort((a, b) => b.priority - a.priority)
                .map((candidate) => [candidate.id, labelBox(candidate, next.get(candidate.id)!)]),
        );
        const changed = network
            .nodes()
            .filter(
                (id) => textChanged.includes(id) || next.get(id) !== state.labelPlacements.get(id),
            );
        state.labelPlacements = next;

        for (const id of changed) {
            if (
                state.expandedLabels[id]?.includes('\n') &&
                network.getNodeAttribute(id, 'labelContinuationPlacement') !== next.get(id)
            ) {
                network.setNodeAttribute(id, 'labelContinuationPlacement', next.get(id));
            }
        }

        if (changed.length) {
            sigmaInstance.scheduleRefresh();
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
            delete state.expandedLabels[id];
        }

        wrappedLabels.clear();

        sigmaInstance.scheduleRender();
    });

    return () => {
        disposed = true;
        sigmaInstance.off('beforeRender', layoutLabels);
    };
}
