export function createDimmedNodeColors(colors: Iterable<string>, background: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context is required to resolve node colors.');
    }

    const dimmed = new Map<string, string>();

    for (const color of new Set(colors)) {
        context.globalAlpha = 1;
        context.fillStyle = background;
        context.fillRect(0, 0, 1, 1);
        context.globalAlpha = 0.2;
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);

        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        dimmed.set(
            color,
            `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
        );
    }

    return dimmed;
}
