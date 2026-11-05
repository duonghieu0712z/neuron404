interface Point {
    x: number;
    y: number;
}

export function getRegionHull(positions: Point[], padding: number): Point[] {
    const points = positions
        .flatMap((position) =>
            Array.from({ length: 12 }, (_, index) => {
                const angle = (index * Math.PI) / 6;
                return {
                    x: position.x + Math.cos(angle) * padding,
                    y: position.y + Math.sin(angle) * padding,
                };
            }),
        )
        .sort((a, b) => a.x - b.x || a.y - b.y);
    if (points.length < 3) return points;
    const cross = (a: Point, b: Point, c: Point) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const lower: Point[] = [];
    const upper: Point[] = [];
    for (const point of points) {
        while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
        lower.push(point);
    }
    for (const point of [...points].reverse()) {
        while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
