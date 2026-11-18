import type { MembershipLink } from './membership-hover';

type HoverTarget =
    { kind: 'node' | 'edge'; id: string } | { kind: 'membership'; link: MembershipLink };

function sameTarget(a: HoverTarget | null, b: HoverTarget | null) {
    if (a === null || b === null) {
        return a === b;
    }
    if (a.kind === 'membership' && b.kind === 'membership') {
        return a.link.source === b.link.source && a.link.target === b.link.target;
    }
    return a.kind !== 'membership' && b.kind !== 'membership' && a.kind === b.kind && a.id === b.id;
}

export function createHoverIntent(onChange: (target: HoverTarget | null) => void, delay = 150) {
    let target: HoverTarget | null = null;
    let active: HoverTarget | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const cancelTimer = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const enter = (next: HoverTarget | null) => {
        if (disposed || sameTarget(target, next)) {
            return;
        }
        cancelTimer();
        target = next;
        if (!sameTarget(active, next)) {
            timer = setTimeout(() => {
                timer = null;
                active = next;
                onChange(next);
            }, delay);
        }
    };

    return {
        enter,
        leave(previous: HoverTarget) {
            if (sameTarget(target, previous)) {
                enter(null);
            }
        },
        isOver(kind: HoverTarget['kind']) {
            return target?.kind === kind;
        },
        clear() {
            cancelTimer();
            target = null;
            if (active) {
                active = null;
                onChange(null);
            }
        },
        cancelPending() {
            cancelTimer();
            target = active;
        },
        dispose() {
            disposed = true;
            cancelTimer();
            target = null;
            active = null;
        },
    };
}
