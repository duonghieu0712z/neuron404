import type { RenderState } from './render-state';
import type Sigma from 'sigma';

interface LabelInteractions {
    enter: (id: string) => void;
    leave: (id: string) => void;
    open: (id: string) => void;
    cancelPending: () => void;
}

export function createLabelInteractions(
    renderer: Sigma,
    state: RenderState,
    actions: LabelInteractions,
) {
    const container = renderer.getContainer();
    let hovered: string | null = null;
    let pressed: { id: string; x: number; y: number } | null = null;

    const hit = (event: PointerEvent) => {
        const bounds = container.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;

        for (const [id, box] of state.expandedLabelAreas) {
            if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
                return id;
            }
        }

        return null;
    };

    const move = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || event.buttons) {
            return;
        }

        const id = hit(event);
        if (id) {
            hovered = id;
            actions.enter(id);
            event.stopPropagation();
        } else if (hovered) {
            const bounds = container.getBoundingClientRect();
            const attributes = renderer.getGraph().getNodeAttributes(hovered);
            const position = renderer.graphToViewport({ x: attributes.x, y: attributes.y });
            const radius = renderer.scaleSize(
                renderer.getGraph().getNodeAttribute(hovered, 'size'),
            );

            if (
                Math.hypot(
                    event.clientX - bounds.left - position.x,
                    event.clientY - bounds.top - position.y,
                ) > radius
            ) {
                actions.leave(hovered);
            }

            hovered = null;
        }
    };

    const down = (event: PointerEvent) => {
        const id = hit(event);
        if (id && event.button === 0) {
            pressed = { id, x: event.clientX, y: event.clientY };
            actions.cancelPending();
            event.stopPropagation();
        }
    };

    const up = (event: PointerEvent) => {
        const previous = pressed;
        pressed = null;
        if (!previous) {
            return;
        }

        event.stopPropagation();
        if (
            hit(event) === previous.id &&
            Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 5
        ) {
            actions.open(previous.id);
        }
    };

    const leave = () => {
        pressed = null;
        hovered = null;
    };

    container.addEventListener('pointermove', move, true);
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('pointerup', up, true);
    container.addEventListener('pointerleave', leave);
    container.addEventListener('pointercancel', leave);

    return () => {
        container.removeEventListener('pointermove', move, true);
        container.removeEventListener('pointerdown', down, true);
        container.removeEventListener('pointerup', up, true);
        container.removeEventListener('pointerleave', leave);
        container.removeEventListener('pointercancel', leave);
    };
}
