import type Sigma from 'sigma';

export function fitNetworkInView(renderer: Sigma | null) {
    if (!renderer) {
        return;
    }

    const graph = renderer.getGraph();
    const nodes = graph.nodes().filter((id) => !renderer!.getNodeState(id).isHidden);

    if (nodes.length === 0) {
        return;
    }

    const xs = nodes.map((id) => graph.getNodeAttribute(id, 'x') as number);
    const ys = nodes.map((id) => graph.getNodeAttribute(id, 'y') as number);
    const min = { x: Math.min(...xs), y: Math.min(...ys) };
    const max = { x: Math.max(...xs), y: Math.max(...ys) };

    const center = renderer.graphToFramedGraph({
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
    });

    const cameraState = { ...center, angle: 0, ratio: 1 };
    const start = renderer.graphToViewport(min, { cameraState });
    const end = renderer.graphToViewport(max, { cameraState });
    const { width, height } = renderer.getDimensions();
    const padding = Math.min(renderer.getStagePadding(), Math.min(width, height) / 4);

    const ratio = Math.max(
        renderer.getSetting('minCameraRatio') ?? 0.15,
        Math.abs(end.x - start.x) / Math.max(1, width - padding * 2),
        Math.abs(end.y - start.y) / Math.max(1, height - padding * 2),
    );

    if (ratio > (renderer.getSetting('maxCameraRatio') ?? Infinity)) {
        renderer.setSetting('maxCameraRatio', ratio);
    }

    void renderer.getCamera().animate({ ...cameraState, ratio }, { duration: 250 });
}

export function focusNetworkNode(renderer: Sigma | null, id: string) {
    if (!renderer?.getGraph().hasNode(id)) {
        return;
    }

    const graph = renderer.getGraph();
    const center = renderer.graphToFramedGraph({
        x: graph.getNodeAttribute(id, 'x'),
        y: graph.getNodeAttribute(id, 'y'),
    });
    const camera = renderer.getCamera();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    void camera.animate(
        { ...center, ratio: Math.min(camera.getState().ratio, 0.7) },
        { duration: reducedMotion ? 0 : 250 },
    );
}

export function focusNetworkScope(renderer: Sigma | null, ids: string[], selectedId: string) {
    if (!renderer?.getGraph().hasNode(selectedId)) {
        return false;
    }

    const graph = renderer.getGraph();
    const selectedPosition = {
        x: graph.getNodeAttribute(selectedId, 'x') as number,
        y: graph.getNodeAttribute(selectedId, 'y') as number,
    };
    const nodes = [...new Set([selectedId, ...ids])].filter(
        (id) => graph.hasNode(id) && !renderer.getNodeState(id).isHidden,
    );

    if (!nodes.includes(selectedId)) {
        return false;
    }

    if (nodes.length === 1) {
        const point = renderer.graphToViewport(selectedPosition);
        const { width, height } = renderer.getDimensions();
        if (
            point.x >= width * 0.2 &&
            point.x <= width * 0.8 &&
            point.y >= height * 0.2 &&
            point.y <= height * 0.8 &&
            renderer.getCamera().getState().ratio <= 0.7
        ) {
            return false;
        }
        focusNetworkNode(renderer, selectedId);
        return true;
    }

    const positions = nodes.map((id) => ({
        x: graph.getNodeAttribute(id, 'x') as number,
        y: graph.getNodeAttribute(id, 'y') as number,
    }));
    const min = {
        x: Math.min(...positions.map(({ x }) => x)),
        y: Math.min(...positions.map(({ y }) => y)),
    };
    const max = {
        x: Math.max(...positions.map(({ x }) => x)),
        y: Math.max(...positions.map(({ y }) => y)),
    };
    const center = renderer.graphToFramedGraph({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 });
    const cameraState = { ...center, angle: 0, ratio: 1 };
    const start = renderer.graphToViewport(min, { cameraState });
    const end = renderer.graphToViewport(max, { cameraState });
    const { width, height } = renderer.getDimensions();
    const padding = Math.min(Math.max(48, renderer.getStagePadding()), Math.min(width, height) / 4);
    const fitRatio = Math.max(
        renderer.getSetting('minCameraRatio') ?? 0.15,
        Math.abs(end.x - start.x) / Math.max(1, width - 2 * padding),
        Math.abs(end.y - start.y) / Math.max(1, height - 2 * padding),
    );
    const maximumRatio = Math.min(1, renderer.getSetting('maxCameraRatio') ?? Infinity);
    const ratio = Math.min(fitRatio, maximumRatio);
    const camera = renderer.getCamera();
    const currentRatio = camera.getState().ratio;
    const comfortablyVisible = positions.every((position) => {
        const point = renderer.graphToViewport(position);
        return (
            point.x >= padding &&
            point.x <= width - padding &&
            point.y >= padding &&
            point.y <= height - padding
        );
    });

    if (comfortablyVisible && currentRatio >= ratio * 0.85 && currentRatio <= ratio * 1.4) {
        return false;
    }

    const targetCenter =
        fitRatio > maximumRatio ? renderer.graphToFramedGraph(selectedPosition) : center;
    const current = camera.getState();
    if (
        Math.abs(current.x - targetCenter.x) < 0.00001 &&
        Math.abs(current.y - targetCenter.y) < 0.00001 &&
        Math.abs(current.ratio - ratio) < 0.00001 &&
        Math.abs(current.angle) < 0.00001
    ) {
        return false;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void camera.animate(
        { ...targetCenter, angle: 0, ratio },
        { duration: reducedMotion ? 0 : 250 },
    );
    return true;
}
