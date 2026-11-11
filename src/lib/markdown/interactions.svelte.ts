export function createMarkdownInteractions(
    tooltipId: string,
    getOnSelectNeuron: () => ((id: string) => void) | undefined,
) {
    let citation = $state<{
        anchor: HTMLAnchorElement;
        label: string;
        description: string;
    } | null>(null);

    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    function cancelClose() {
        clearTimeout(closeTimer);
    }

    function closeCitation() {
        cancelClose();
        citation?.anchor.removeAttribute('aria-describedby');
        citation = null;
    }

    function scheduleClose() {
        cancelClose();
        closeTimer = setTimeout(() => {
            if (document.activeElement !== citation?.anchor) {
                closeCitation();
            }
        }, 150);
    }

    function showCitation(anchor: HTMLAnchorElement) {
        cancelClose();

        if (citation?.anchor !== anchor) {
            closeCitation();
        }

        anchor.setAttribute('aria-describedby', tooltipId);
        citation = {
            anchor,
            label: anchor.dataset.citationLabel ?? anchor.textContent ?? '',
            description: anchor.dataset.citationDescription ?? '',
        };
    }

    function interceptLinks(node: HTMLElement) {
        const findCitation = (target: EventTarget | null) => {
            const anchor =
                target instanceof Element
                    ? target.closest<HTMLAnchorElement>('a[data-citation]')
                    : null;
            return anchor && node.contains(anchor) ? anchor : null;
        };

        const pointerover = (event: PointerEvent) => {
            const anchor = findCitation(event.target);

            if (anchor && event.pointerType !== 'touch') {
                showCitation(anchor);
            }
        };

        const pointerout = (event: PointerEvent) => {
            const anchor = findCitation(event.target);

            if (
                anchor &&
                !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))
            ) {
                scheduleClose();
            }
        };

        const focusin = (event: FocusEvent) => {
            const anchor = findCitation(event.target);

            if (anchor) {
                showCitation(anchor);
            }
        };

        const focusout = () => closeCitation();

        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeCitation();
            }
        };

        const click = (event: MouseEvent) => {
            closeCitation();

            if (
                !getOnSelectNeuron() ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const target = event.target;

            const link =
                target instanceof Element
                    ? target.closest<HTMLAnchorElement>('a[data-neuron-id]')
                    : null;

            const id = link?.dataset.neuronId;

            if (!id || !node.contains(link)) {
                return;
            }

            event.preventDefault();
            getOnSelectNeuron()?.(id);
        };

        node.addEventListener('click', click);
        node.addEventListener('pointerover', pointerover);
        node.addEventListener('pointerout', pointerout);
        node.addEventListener('focusin', focusin);
        node.addEventListener('focusout', focusout);
        node.addEventListener('keydown', keydown);

        return {
            destroy() {
                closeCitation();
                node.removeEventListener('click', click);
                node.removeEventListener('pointerover', pointerover);
                node.removeEventListener('pointerout', pointerout);
                node.removeEventListener('focusin', focusin);
                node.removeEventListener('focusout', focusout);
                node.removeEventListener('keydown', keydown);
            },
        };
    }

    return {
        get citation() {
            return citation;
        },
        cancelClose,
        closeCitation,
        scheduleClose,
        interceptLinks,
    };
}
