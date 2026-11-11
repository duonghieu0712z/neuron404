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

    if (length <= 2) {
        return null;
    }
    // Keep the phase stable while nodes move or the camera zooms.
    const travel = 1600;
    const cycle = travel + 350;
    const phase = ((Math.max(0, elapsed) + offset * cycle) % cycle) / travel;

    if (phase >= 1) {
        return null;
    }

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

export function phaseOffset(id: string) {
    let hash = 2166136261;

    for (const character of id) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }

    return (hash >>> 0) / 4294967296;
}
