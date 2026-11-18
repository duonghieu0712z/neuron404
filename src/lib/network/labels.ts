import { LABEL_PADDING } from './appearance';

export type LabelPlacement = 'below' | 'above' | 'right' | 'left';

export interface LabelCandidate {
    id: string;
    x: number;
    y: number;
    radius: number;
    width: number;
    height?: number;
    rasterized?: boolean;
    priority: number;
    required?: boolean;
    selected?: boolean;
    belowFirst?: boolean;
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

export function labelBox(node: LabelCandidate, placement: LabelPlacement): Box {
    const gap = node.radius + 5;
    const halfWidth = node.width / 2 + (node.required ? LABEL_PADDING : 4);
    const textHeight = node.height ?? 12;
    const halfHeight = textHeight / 2 + (node.required ? LABEL_PADDING : 3);
    let x = node.x;
    let y = node.y;

    if (placement === 'right') {
        x += gap + node.width / 2;
        y += (textHeight - (node.rasterized ? 0 : 12)) / 2;
    } else if (placement === 'left') {
        x -= gap + node.width / 2;
        y += (textHeight - (node.rasterized ? 0 : 12)) / 2;
    }

    if (placement === 'below') {
        y += gap + textHeight / 2;
    } else if (placement === 'above') {
        y -= gap + textHeight / 2;
    }

    return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
    };
}

export function chooseLabelPlacements(
    candidates: LabelCandidate[],
    width: number,
    height: number,
    previous: ReadonlyMap<string, LabelPlacement> = new Map(),
) {
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

    const anchored = [...candidates].sort(
        (a, b) => Number(b.selected ?? false) - Number(a.selected ?? false),
    );

    for (const candidate of anchored) {
        if ((!candidate.selected && !candidate.belowFirst) || !candidate.required) {
            continue;
        }

        const options: LabelPlacement[] = ['below', 'above'];
        const placement = options.find((option) => {
            const box = labelBox(candidate, option);
            return (
                box.left >= 4 &&
                box.right <= width - 4 &&
                box.top >= 4 &&
                box.bottom <= height - 4 &&
                (candidate.selected || !occupied.some((other) => intersects(box, other)))
            );
        });

        if (placement) {
            placements.set(candidate.id, placement);
            occupied.push(labelBox(candidate, placement));
        }
    }

    for (const candidate of candidates) {
        const placement = previous.get(candidate.id);
        if (
            placements.has(candidate.id) ||
            !candidate.required ||
            !placement ||
            (candidate.rasterized && placement !== 'below' && placement !== 'above')
        ) {
            continue;
        }

        const box = labelBox(candidate, placement);
        if (
            box.left >= 4 &&
            box.right <= width - 4 &&
            box.top >= 4 &&
            box.bottom <= height - 4 &&
            !occupied.some((other) => intersects(box, other))
        ) {
            placements.set(candidate.id, placement);
            occupied.push(box);
        }
    }

    const ordered = [...candidates].sort(
        (a, b) =>
            Number(b.required ?? false) - Number(a.required ?? false) ||
            b.priority - a.priority ||
            b.radius - a.radius ||
            a.id.localeCompare(b.id),
    );
    for (const candidate of ordered) {
        if (placements.has(candidate.id)) {
            continue;
        }

        if (candidate.required) {
            const options: LabelPlacement[] = candidate.rasterized
                ? ['below', 'above']
                : ['below', 'above', 'right', 'left'];
            const free = options.filter((option) => {
                const box = labelBox(candidate, option);
                return (
                    !occupied.some((other) => intersects(box, other)) &&
                    !nodeBoxes.some((node) => node.id !== candidate.id && intersects(box, node))
                );
            });
            let placement =
                free.find((option) => {
                    const box = labelBox(candidate, option);
                    return (
                        box.left >= 4 &&
                        box.right <= width - 4 &&
                        box.top >= 4 &&
                        box.bottom <= height - 4
                    );
                }) ?? free.find((option) => intersects(labelBox(candidate, option), viewport));

            if (!placement) {
                const overlap = (a: Box, b: Box) =>
                    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                const score = (option: LabelPlacement) => {
                    const box = labelBox(candidate, option);
                    const area = (box.right - box.left) * (box.bottom - box.top);
                    return (
                        (area - overlap(box, viewport)) * 4 +
                        occupied.reduce((sum, other) => sum + overlap(box, other) * 4, 0) +
                        nodeBoxes.reduce(
                            (sum, other) =>
                                sum + (other.id === candidate.id ? 0 : overlap(box, other)),
                            0,
                        )
                    );
                };
                placement = options.reduce((best, option) =>
                    score(option) < score(best) ? option : best,
                );
            }

            placements.set(candidate.id, placement);
            occupied.push(labelBox(candidate, placement));
            continue;
        }
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
        if (!position) {
            continue;
        }
        placements.set(candidate.id, position);
        occupied.push(labelBox(candidate, position));
    }
    return placements;
}
