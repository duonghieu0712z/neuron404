import type { NetworkGraph } from './graph';
import type { NetworkPositions } from './types';
import type Sigma from 'sigma';

import { getNodeEntranceOffset } from './simulation';
import { createSynapseSignals } from './synapse-signals';

export function createRendererMotion(
    sigmaInstance: Sigma,
    graph: NetworkGraph,
    positions: NetworkPositions,
    synapseSignals: ReturnType<typeof createSynapseSignals>,
) {
    const { network, simulation, simNodes, simNodeById } = graph;
    let entranceActive = graph.entranceActive;
    let draggedNode: string | null = null;
    let motionAllowed = false;
    let motionFrame: number | null = null;
    const motionStartedAt = performance.now();

    const syncPositions = (elapsed: number) => {
        network.updateEachNodeAttributes(
            (id, attributes) => {
                if (id === draggedNode) {
                    return attributes;
                }

                const node = simNodeById.get(id)!;
                const position = { x: node.x ?? 0, y: node.y ?? 0 };
                positions[id] = position;
                const entrance =
                    motionAllowed && entranceActive
                        ? getNodeEntranceOffset(node.index ?? 0, elapsed)
                        : { x: 0, y: 0 };

                return {
                    ...attributes,
                    x: position.x + entrance.x,
                    y: position.y + entrance.y,
                };
            },
            { attributes: ['x', 'y'] },
        );
    };

    const animateMotion = (time: number) => {
        const elapsed = time - motionStartedAt;
        syncPositions(elapsed);

        if (elapsed < 1800 && entranceActive) {
            motionFrame = requestAnimationFrame(animateMotion);
        } else {
            entranceActive = false;
            motionFrame = null;
        }
    };

    const stopMotion = () => {
        if (motionFrame !== null) {
            cancelAnimationFrame(motionFrame);
        }

        motionFrame = null;
    };

    const startMotion = () => {
        if (motionFrame === null) {
            motionFrame = requestAnimationFrame(animateMotion);
        }
    };

    const freezePositions = () => {
        simulation.stop().alphaTarget(0);
        stopMotion();
        entranceActive = false;

        for (const node of simNodes) {
            node.x = network.getNodeAttribute(node.id, 'x');
            node.y = network.getNodeAttribute(node.id, 'y');
            node.vx = 0;
            node.vy = 0;
            positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 };
        }
    };

    simulation.on('tick', () => syncPositions(0));
    simulation.on('end', () => {
        simulation.alpha(0);

        for (const node of simNodes) {
            node.vx = 0;
            node.vy = 0;
        }
    });

    const setMotion = (enabled: boolean) => {
        motionAllowed = enabled;
        synapseSignals.setEnabled(enabled);

        if (!enabled) {
            freezePositions();
        } else if (!document.hidden) {
            if (entranceActive) {
                startMotion();
            }

            if (simulation.alpha() > simulation.alphaMin()) {
                simulation.restart();
            }
        }
    };

    const handleVisibility = () => {
        if (document.hidden) {
            stopMotion();
            simulation.stop();
        } else {
            if (motionAllowed && entranceActive) {
                startMotion();
            }

            if (motionAllowed && simulation.alpha() > simulation.alphaMin()) {
                simulation.restart();
            }
        }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    sigmaInstance.on('nodeDragStart', ({ node }) => {
        freezePositions();
        draggedNode = node;
        const target = simNodeById.get(node)!;
        target.fx = network.getNodeAttribute(node, 'x');
        target.fy = network.getNodeAttribute(node, 'y');
        simulation.alpha(0.25).alphaTarget(0.25).restart();
    });
    sigmaInstance.on('nodeDrag', ({ node }) => {
        const target = simNodeById.get(node)!;
        target.fx = network.getNodeAttribute(node, 'x');
        target.fy = network.getNodeAttribute(node, 'y');
        target.x = target.fx ?? 0;
        target.y = target.fy ?? 0;
    });
    sigmaInstance.on('nodeDragEnd', ({ node }) => {
        const target = simNodeById.get(node)!;
        target.fx = null;
        target.fy = null;
        draggedNode = null;
        positions[node] = { x: target.x ?? 0, y: target.y ?? 0 };

        if (motionAllowed) {
            simulation.alphaTarget(0).restart();
        } else {
            freezePositions();
        }
    });

    return {
        setMotion,
        dispose() {
            document.removeEventListener('visibilitychange', handleVisibility);
            simulation.stop();
            stopMotion();
        },
    };
}
