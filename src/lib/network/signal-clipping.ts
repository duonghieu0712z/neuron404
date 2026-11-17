import type { Point } from './webgl-shapes';

export interface SignalMask {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface NodeMask extends Point {
    radius: number;
}

export function getVisibleSignalIntervals(
    start: Point,
    end: Point,
    labels: SignalMask[],
    nodes: NodeMask[],
) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) {
        return [];
    }

    const blocked: [number, number][] = [];
    for (const mask of labels) {
        let lower = 0;
        let upper = 1;
        for (const [origin, direction, minimum, maximum] of [
            [start.x, dx, mask.left - 3, mask.right + 3],
            [start.y, dy, mask.top - 3, mask.bottom + 3],
        ]) {
            if (direction === 0) {
                if (origin < minimum || origin > maximum) {
                    upper = -1;
                }
                continue;
            }
            const a = (minimum - origin) / direction;
            const b = (maximum - origin) / direction;
            lower = Math.max(lower, Math.min(a, b));
            upper = Math.min(upper, Math.max(a, b));
        }
        if (lower < upper) {
            blocked.push([lower, upper]);
        }
    }

    for (const node of nodes) {
        const projection = ((node.x - start.x) * dx + (node.y - start.y) * dy) / lengthSquared;
        const nearest = { x: start.x + projection * dx, y: start.y + projection * dy };
        const perpendicularSquared = (node.x - nearest.x) ** 2 + (node.y - nearest.y) ** 2;
        const radius = node.radius + 3;
        if (perpendicularSquared >= radius ** 2) {
            continue;
        }
        const extent = Math.sqrt((radius ** 2 - perpendicularSquared) / lengthSquared);
        const lower = Math.max(0, projection - extent);
        const upper = Math.min(1, projection + extent);
        if (lower < upper) {
            blocked.push([lower, upper]);
        }
    }

    blocked.sort((a, b) => a[0] - b[0]);
    const visible: [number, number][] = [];
    let cursor = 0;
    for (const [lower, upper] of blocked) {
        if (lower > cursor) {
            visible.push([cursor, lower]);
        }
        cursor = Math.max(cursor, upper);
    }
    if (cursor < 1) {
        visible.push([cursor, 1]);
    }
    return visible;
}
