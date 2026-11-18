import type { RenderState } from './render-state';
import type { createSigmaRenderer } from './renderer-styles';

import { createLabelProgram } from 'sigma/rendering';

import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT } from './appearance';

export function createMultilineLabelLayer(
    renderer: ReturnType<typeof createSigmaRenderer>,
    state: RenderState,
    color: string,
) {
    renderer.addCustomLayerProgram('multiline-labels', 'multilineLabels', (gl) => {
        const program = createLabelProgram(gl, null, renderer, {
            label: {
                font: { family: 'Inter Variable, sans-serif', size: LABEL_FONT_SIZE },
                margin: 5,
            },
        });
        const fontKey = program.registerFont('Inter Variable, sans-serif');
        const canvas = gl.canvas;
        let lost = false;
        const contextLost = () => {
            lost = true;
        };
        canvas.addEventListener('webglcontextlost', contextLost);

        return {
            render(params) {
                const labels = [...state.expandedLabelAreas.keys()].flatMap((id) => {
                    const display = renderer.getNodeDisplayData(id);
                    const text = state.expandedLabels[id];
                    const nodeIndex = renderer.getNodeDataTexture().getIndex(id) ?? -1;
                    if (
                        !display ||
                        !text ||
                        nodeIndex < 0 ||
                        display.labelAttachment !== 'continuation' ||
                        !renderer.getNodeDisplayedLabels().has(id)
                    ) {
                        return [];
                    }

                    const lines = text.split('\n');
                    const position = state.labelPlacements.get(id) ?? 'below';
                    return lines.map((line, index) => ({
                        key: `${id}:${index}`,
                        text: line,
                        nodeIndex,
                        display,
                        position,
                        margin:
                            5 +
                            (position === 'above' ? lines.length - index - 1 : index) *
                                LABEL_LINE_HEIGHT,
                    }));
                });

                program.ensureGlyphsReady(
                    labels.map((label) => label.text),
                    fontKey,
                );
                program.reallocate(labels.reduce((sum, label) => sum + label.text.length, 0));
                let offset = 0;
                for (const label of labels) {
                    offset += program.processLabel(label.key, offset, {
                        text: label.text,
                        x: label.display.x,
                        y: label.display.y,
                        nodeSize: label.display.size,
                        size: LABEL_FONT_SIZE,
                        color,
                        margin: label.margin,
                        position: label.position,
                        hidden: false,
                        forceLabel: true,
                        type: 'default',
                        zIndex: 0,
                        parentType: 'node',
                        parentKey: label.key,
                        fontKey,
                        labelAngle: 0,
                        nodeIndex: label.nodeIndex,
                    });
                }

                program.invalidateBuffers();
                program.render(params);
            },
            kill() {
                canvas.removeEventListener('webglcontextlost', contextLost);
                if (!lost) {
                    program.kill();
                }
            },
        };
    });

    return () => renderer.removeCustomLayerProgram('multiline-labels');
}
