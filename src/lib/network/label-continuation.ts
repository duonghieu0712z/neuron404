import { LABEL_LINE_HEIGHT } from './appearance';

export function createLabelContinuation(text: string, pixelRatio: number, width: number) {
    const lines = text.split('\n');
    if (!lines.length) {
        return null;
    }

    const canvas = document.createElement('canvas');
    // Reserve continuation space in Sigma's native backdrop without drawing another box.
    canvas.width = Math.max(1, Math.ceil(width * pixelRatio));
    canvas.height = Math.max(
        1,
        Math.ceil(((lines.length - 1) * LABEL_LINE_HEIGHT - 2) * pixelRatio),
    );

    return { type: 'canvas' as const, canvas };
}
