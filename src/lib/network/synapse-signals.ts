import type Sigma from 'sigma';

import { createFrameCache } from './frame-cache';
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
    let renderDepth = 0;
    let sceneReady = false;
    let nodes = new Map<string, { x: number; y: number; radius: number }>();
    let nodeMasks: { x: number; y: number; radius: number }[] = [];
    let labelMasks: SignalMask[] = [];
    let camera = renderer.getCamera().getState();
    const mesh = new ShapeMesh();

    const createResources = () => {
        const gl = renderer.getWebGLContext();
        return { gl, cache: createFrameCache(gl), program: createShapeProgram(gl) };
    };
    let resources: ReturnType<typeof createResources> | null = createResources();

    const canAnimate = () => !disposed && enabled && !document.hidden && links.length > 0;

    const prepareScene = () => {
        nodes = new Map(
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
                    ];
                }),
        );
        nodeMasks = [...nodes.values()];
        labelMasks = getLabelMasks();
        camera = renderer.getCamera().getState();
    };

    const buildMesh = () => {
        mesh.reset();
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

    const drawSignals = () => {
        if (!resources || !canAnimate()) {
            return;
        }
        const { gl, program } = resources;
        const { width, height } = renderer.getDimensions();
        const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        try {
            program.draw(buildMesh(), width, height);
        } finally {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
            gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        }
    };

    const invalidate = () => {
        sceneReady = false;
        resources?.cache.invalidate();
    };

    const animate = () => {
        frame = null;
        if (!canAnimate() || !resources || resources.gl.isContextLost()) {
            return;
        }
        const nextCamera = renderer.getCamera().getState();
        if (
            sceneReady &&
            camera.x === nextCamera.x &&
            camera.y === nextCamera.y &&
            camera.ratio === nextCamera.ratio &&
            camera.angle === nextCamera.angle &&
            resources.cache.restore()
        ) {
            drawSignals();
        } else {
            renderer.scheduleRender();
        }
        frame = requestAnimationFrame(animate);
    };

    const update = () => {
        if (canAnimate()) {
            if (frame === null) {
                frame = requestAnimationFrame(animate);
            }
            if (!sceneReady) {
                renderer.scheduleRender();
            }
        } else {
            if (frame !== null) {
                cancelAnimationFrame(frame);
                frame = null;
            }
            if (!document.hidden && !disposed && (!sceneReady || !resources?.cache.restore())) {
                renderer.scheduleRender();
            }
        }
    };

    const beforeRender = () => {
        renderDepth++;
        invalidate();
    };
    // Nested renders must finish before capturing a signal-free scene.
    const afterRender = () => {
        renderDepth = Math.max(0, renderDepth - 1);
        if (renderDepth || !canAnimate() || !resources || resources.gl.isContextLost()) {
            return;
        }
        prepareScene();
        sceneReady = resources.cache.capture();
        drawSignals();
    };
    const contextLost = () => {
        resources?.cache.dispose();
        resources?.program.kill();
        resources = null;
        invalidate();
        renderDepth = 0;
        if (frame !== null) {
            cancelAnimationFrame(frame);
            frame = null;
        }
    };
    const contextRestored = () => {
        resources = createResources();
        invalidate();
        update();
    };
    const graphEvents = [
        'nodeAdded',
        'nodeDropped',
        'edgeAdded',
        'edgeDropped',
        'cleared',
        'edgesCleared',
        'nodeAttributesUpdated',
        'edgeAttributesUpdated',
        'eachNodeAttributesUpdated',
        'eachEdgeAttributesUpdated',
    ] as const;
    for (const event of graphEvents) {
        graph.on(event, invalidate);
    }
    renderer.on('beforeRender', beforeRender);
    renderer.on('afterRender', afterRender);
    renderer.on('webglContextLost', contextLost);
    renderer.on('webglContextRestored', contextRestored);

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
            renderer.off('beforeRender', beforeRender);
            renderer.off('afterRender', afterRender);
            renderer.off('webglContextLost', contextLost);
            renderer.off('webglContextRestored', contextRestored);
            for (const event of graphEvents) {
                graph.off(event, invalidate);
            }
            resources?.cache.dispose();
            resources?.program.kill();
            resources = null;
            document.removeEventListener('visibilitychange', update);
        },
    };
}
