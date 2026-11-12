import type Sigma from 'sigma';

export interface MembershipLink {
    source: string;
    target: string;
}

export interface MembershipSegment extends MembershipLink {
    start: { x: number; y: number };
    end: { x: number; y: number };
}

export function findMembershipLink(
    segments: MembershipSegment[],
    point: { x: number; y: number },
    tolerance = 6,
): MembershipLink | null {
    let closest: MembershipLink | null = null;
    let minimum = tolerance;

    for (const segment of segments) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) {
            continue;
        }

        const projection =
            ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
        if (projection < 0 || projection > 1) {
            continue;
        }

        const distance = Math.hypot(
            point.x - segment.start.x - projection * dx,
            point.y - segment.start.y - projection * dy,
        );
        if (distance < minimum) {
            minimum = distance;
            closest = { source: segment.source, target: segment.target };
        }
    }

    return closest;
}

export function createMembershipHover(
    renderer: Sigma,
    onHover: (link: MembershipLink | null) => void,
    isBlocked: () => boolean,
) {
    const container = renderer.getContainer();
    const network = renderer.getGraph();
    let pointer: { x: number; y: number } | null = null;
    let segments: MembershipSegment[] = [];

    const update = () => {
        if (!pointer || isBlocked()) {
            onHover(null);
            return;
        }

        const point = pointer;
        const overNode = network.someNode((id, attributes) => {
            const state = renderer.getNodeState(id);
            if (state.isHidden) {
                return false;
            }
            if (state.isHovered) {
                return true;
            }

            const position = renderer.graphToViewport({ x: attributes.x, y: attributes.y });
            return (
                Math.hypot(point.x - position.x, point.y - position.y) <=
                renderer.scaleSize(attributes.size) + 3
            );
        });
        onHover(overNode ? null : findMembershipLink(segments, point));
    };

    const move = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || event.buttons) {
            leave();
            return;
        }

        const bounds = container.getBoundingClientRect();
        pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        update();
    };

    const leave = () => {
        pointer = null;
        onHover(null);
    };

    container.addEventListener('pointermove', move);
    container.addEventListener('pointerleave', leave);
    container.addEventListener('pointerdown', leave);

    return {
        updateSegments(next: MembershipSegment[]) {
            segments = next;
            update();
        },
        dispose() {
            container.removeEventListener('pointermove', move);
            container.removeEventListener('pointerleave', leave);
            container.removeEventListener('pointerdown', leave);
        },
    };
}
