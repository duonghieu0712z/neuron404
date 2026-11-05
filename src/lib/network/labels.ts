export type LabelPlacement = 'below' | 'above' | 'right' | 'left';

export interface LabelCandidate {
    id: string;
    x: number;
    y: number;
    radius: number;
    width: number;
    priority: number;
}

interface Box {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

function intersects(a: Box, b: Box) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function labelBox(node: LabelCandidate, placement: LabelPlacement): Box {
    const gap = node.radius + 5;
    const halfWidth = node.width / 2 + 4;
    const halfHeight = 9;
    const x =
        node.x +
        (placement === 'right'
            ? gap + node.width / 2
            : placement === 'left'
              ? -gap - node.width / 2
              : 0);
    const y = node.y + (placement === 'below' ? gap + 6 : placement === 'above' ? -gap - 6 : 0);
    return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
    };
}

export function chooseLabelPlacements(candidates: LabelCandidate[], width: number, height: number) {
    const placements = new Map<string, LabelPlacement>();
    const occupied: Box[] = [];
    const viewport = { left: 0, top: 0, right: width, bottom: height };
    const nodeBoxes = candidates.map((node) => ({
        id: node.id,
        left: node.x - node.radius - 3,
        right: node.x + node.radius + 3,
        top: node.y - node.radius - 3,
        bottom: node.y + node.radius + 3,
    }));
    const ordered = [...candidates].sort(
        (a, b) => b.priority - a.priority || b.radius - a.radius || a.id.localeCompare(b.id),
    );
    for (const candidate of ordered) {
        const options: LabelPlacement[] = ['below'];
        const free = options.filter((option) => {
            const box = labelBox(candidate, option);
            return intersects(box, viewport) && !occupied.some((other) => intersects(box, other));
        });
        const position =
            free.find((option) => {
                const box = labelBox(candidate, option);
                return (
                    box.left >= 4 &&
                    box.right <= width - 4 &&
                    box.top >= 4 &&
                    box.bottom <= height - 4 &&
                    (candidate.priority > 0 ||
                        !nodeBoxes.some(
                            (node) => node.id !== candidate.id && intersects(box, node),
                        ))
                );
            }) ?? (candidate.priority > 0 ? free[0] : undefined);
        if (!position) continue;
        placements.set(candidate.id, position);
        occupied.push(labelBox(candidate, position));
    }
    return placements;
}
