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
