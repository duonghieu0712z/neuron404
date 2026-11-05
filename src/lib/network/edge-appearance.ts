export function getEdgeAppearance(color: string, opacity = 0.85) {
    const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
        .toString(16)
        .padStart(2, '0');
    return { solidColor: `${color}${alpha}`, size: 2 };
}
