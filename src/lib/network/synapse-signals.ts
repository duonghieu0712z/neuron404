import type Sigma from 'sigma';

import { getVisibleSignalIntervals, type SignalMask } from './signal-clipping';
import { getSynapsePulse, phaseOffset, type SignalLink } from './signal-geometry';
import { createShapeProgram, shapeColor, ShapeMesh } from './webgl-shapes';

export { getSynapsePulse, type SignalLink } from './signal-geometry';

export function createSynapseSignals(
    renderer: Sigma,
    getLabelMasks: () => SignalMask[] = () => [],
) {
    const graph = renderer.getGraph();
    const startedAt = performance.now();
    let links: (SignalLink & { offset: number })[] = [];
    let enabled = false;
    let frame: number | null = null;
    let disposed = false;

    const canAnimate = () => !disposed && enabled && !document.hidden && links.length > 0;

    const buildMesh = () => {
        const mesh = new ShapeMesh();
        if (!canAnimate()) {
            return mesh;
        }

        const nodes = new Map(
            graph
                .filterNodes((id) => !renderer.getNodeState(id).isHidden)
                .map((id) => {
                    const node = graph.getNodeAttributes(id);
                    return [
                        id,
                        {
                            ...renderer.graphToViewport({ x: node.x, y: node.y }),
                            radius: renderer.scaleSize(node.size),
                        },
                    ] as const;
                }),
        );
        const nodeMasks = [...nodes.values()];
        const labelMasks = getLabelMasks();
        const elapsed = performance.now() - startedAt;

        for (const link of links) {
            const source = nodes.get(link.source);
            const target = nodes.get(link.target);
            if (!source || !target) {
                continue;
            }

            const pulse = getSynapsePulse(
                source,
                target,
                source.radius,
                target.radius,
                elapsed,
                link.offset,
            );
            if (!pulse || pulse.opacity <= 0) {
                continue;
            }

            const point = (t: number) => ({
                x: pulse.tail.x + (pulse.head.x - pulse.tail.x) * t,
                y: pulse.tail.y + (pulse.head.y - pulse.tail.y) * t,
            });
            for (const [start, end] of getVisibleSignalIntervals(
                pulse.tail,
                pulse.head,
                labelMasks,
                nodeMasks,
            )) {
                mesh.line(
                    point(start),
                    point(end),
                    7,
                    shapeColor(link.color, start * pulse.opacity * 0.12),
                    shapeColor(link.color, end * pulse.opacity * 0.12),
                );
                mesh.line(
                    point(start),
                    point(end),
                    2.4,
                    shapeColor(link.color, start * pulse.opacity),
                    shapeColor(link.color, end * pulse.opacity),
                );
                if (end === 1) {
                    mesh.line(pulse.head, pulse.head, 4, shapeColor(link.color, pulse.opacity));
                }
            }
        }
        return mesh;
    };

    renderer.addCustomLayerProgram('synapse-signals', 'nodes', (gl) => {
        const program = createShapeProgram(gl);
        return {
            render({ width, height }) {
                program.draw(buildMesh(), width, height);
            },
            kill: program.kill,
        };
    });

    const animate = () => {
        frame = null;
        if (!canAnimate()) {
            return;
        }
        renderer.scheduleRender();
        frame = requestAnimationFrame(animate);
    };

    const update = () => {
        if (canAnimate()) {
            if (frame === null) {
                frame = requestAnimationFrame(animate);
            }
        } else {
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            frame = null;
        }
        renderer.scheduleRender();
    };

    document.addEventListener('visibilitychange', update);

    return {
        setLinks(next: SignalLink[]) {
            links = next.map((link) => ({ ...link, offset: phaseOffset(link.id) }));
            update();
        },
        setEnabled(value: boolean) {
            enabled = value;
            update();
        },
        dispose() {
            disposed = true;
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            frame = null;
            renderer.removeCustomLayerProgram('synapse-signals');
            document.removeEventListener('visibilitychange', update);
        },
    };
}
