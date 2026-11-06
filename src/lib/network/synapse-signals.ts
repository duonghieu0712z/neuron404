import type Sigma from 'sigma';

interface Point {
    x: number;
    y: number;
}

export interface SignalLink {
    id: string;
    source: string;
    target: string;
    color: string;
}

export function getSynapsePulse(
    source: Point,
    target: Point,
    sourceRadius: number,
    targetRadius: number,
    elapsed: number,
    offset: number,
) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    const start = sourceRadius + 4;
    const end = targetRadius + 4;
    const length = distance - start - end;
    if (length <= 2) return null;
    // Keep the phase stable while nodes move or the camera zooms.
    const travel = 1600;
    const cycle = travel + 350;
    const phase = ((Math.max(0, elapsed) + offset * cycle) % cycle) / travel;
    if (phase >= 1) return null;
    const headDistance = start + length * phase;
    const tailDistance = Math.max(start, headDistance - 18);
    const point = (position: number) => ({
        x: source.x + (dx * position) / distance,
        y: source.y + (dy * position) / distance,
    });
    return {
        head: point(headDistance),
        tail: point(tailDistance),
        opacity: Math.min(1, phase / 0.1, (1 - phase) / 0.12),
    };
}

function phaseOffset(id: string) {
    let hash = 2166136261;
    for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967296;
}

interface SignalMask {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export function createSynapseSignals(
    renderer: Sigma,
    getLabelMasks: () => SignalMask[] = () => [],
) {
    const canvas = renderer.createCanvas('synapse-signals', {
        afterLayer: 'stage',
        style: { pointerEvents: 'none', left: '0', top: '0' },
    });
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    const graph = renderer.getGraph();
    const startedAt = performance.now();
    let links: (SignalLink & { offset: number })[] = [];
    let enabled = false;
    let frame: number | null = null;
    let disposed = false;
    const canAnimate = () =>
        !disposed && !!context && enabled && !document.hidden && links.length > 0;

    const clear = () => {
        if (!context) return;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
    };
    const draw = (time: number) => {
        if (!context || !canAnimate()) {
            clear();
            return;
        }
        const { width, height } = renderer.getDimensions();
        const ratio = window.devicePixelRatio || 1;
        const bufferWidth = Math.round(width * ratio);
        const bufferHeight = Math.round(height * ratio);
        if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
        if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
        if (canvas.style.width !== `${width}px`) canvas.style.width = `${width}px`;
        if (canvas.style.height !== `${height}px`) canvas.style.height = `${height}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.lineCap = 'round';
        for (const link of links) {
            if (
                !graph.hasNode(link.source) ||
                !graph.hasNode(link.target) ||
                renderer.getNodeState(link.source).isHidden ||
                renderer.getNodeState(link.target).isHidden
            )
                continue;
            const source = graph.getNodeAttributes(link.source);
            const target = graph.getNodeAttributes(link.target);
            const pulse = getSynapsePulse(
                renderer.graphToViewport({ x: source.x, y: source.y }),
                renderer.graphToViewport({ x: target.x, y: target.y }),
                renderer.scaleSize(source.size),
                renderer.scaleSize(target.size),
                time - startedAt,
                link.offset,
            );
            if (!pulse || pulse.opacity <= 0) continue;
            context.globalAlpha = pulse.opacity;
            const trail = context.createLinearGradient(
                pulse.tail.x,
                pulse.tail.y,
                pulse.head.x,
                pulse.head.y,
            );
            trail.addColorStop(0, `${link.color}00`);
            trail.addColorStop(0.6, `${link.color}88`);
            trail.addColorStop(1, link.color);
            context.strokeStyle = trail;
            context.lineWidth = 2.4;
            context.shadowColor = link.color;
            context.shadowBlur = 4;
            context.beginPath();
            context.moveTo(pulse.tail.x, pulse.tail.y);
            context.lineTo(pulse.head.x, pulse.head.y);
            context.stroke();
            context.fillStyle = link.color;
            context.beginPath();
            context.arc(pulse.head.x, pulse.head.y, 2, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;
        context.shadowBlur = 0;
        context.save();
        context.globalCompositeOperation = 'destination-out';
        for (const id of graph.nodes()) {
            if (renderer.getNodeState(id).isHidden) continue;
            const node = graph.getNodeAttributes(id);
            const point = renderer.graphToViewport({ x: node.x, y: node.y });
            context.beginPath();
            context.arc(point.x, point.y, renderer.scaleSize(node.size) + 2, 0, Math.PI * 2);
            context.fill();
        }
        for (const mask of getLabelMasks())
            context.clearRect(mask.left, mask.top, mask.right - mask.left, mask.bottom - mask.top);
        context.restore();
    };
    const animate = (time: number) => {
        frame = null;
        if (!canAnimate()) {
            clear();
            return;
        }
        draw(time);
        frame = requestAnimationFrame(animate);
    };
    const update = () => {
        if (canAnimate()) {
            if (frame === null) frame = requestAnimationFrame(animate);
        } else {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            clear();
        }
    };
    const afterRender = () => draw(performance.now());
    renderer.on('afterRender', afterRender);
    document.addEventListener('visibilitychange', update);
    return {
        setLinks(next: SignalLink[]) {
            links = next.map((link) => ({ ...link, offset: phaseOffset(link.id) }));
            clear();
            update();
        },
        setEnabled(value: boolean) {
            enabled = value;
            update();
        },
        dispose() {
            disposed = true;
            update();
            renderer.off('afterRender', afterRender);
            document.removeEventListener('visibilitychange', update);
        },
    };
}
