import type { NetworkNode } from './simulation-types';
import type { SimulationLinkDatum } from 'd3-force';

export function orderRegionMembers<Node extends NetworkNode>(
    members: Node[],
    links: SimulationLinkDatum<Node>[],
) {
    const neighbors = new Map(members.map((node) => [node.id, new Set<string>()]));
    const edges: [string, string][] = [];

    for (const link of links) {
        const source = typeof link.source === 'object' ? link.source.id : String(link.source);
        const target = typeof link.target === 'object' ? link.target.id : String(link.target);

        if (source === target || !neighbors.has(source) || !neighbors.has(target)) {
            continue;
        }

        if (!neighbors.get(source)!.has(target)) {
            edges.push([source, target]);
        }

        neighbors.get(source)!.add(target);
        neighbors.get(target)!.add(source);
    }

    const byDegree = (a: string, b: string) =>
        neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b);

    const visited = new Set<string>();
    const order: string[] = [];

    for (const start of [...neighbors.keys()].sort(byDegree)) {
        const pending = [start];

        while (pending.length) {
            const id = pending.pop()!;

            if (visited.has(id)) {
                continue;
            }

            visited.add(id);
            order.push(id);
            pending.push(...[...neighbors.get(id)!].sort(byDegree).reverse());
        }
    }

    const score = () => {
        const positions = new Map(order.map((id, index) => [id, index]));

        const spans = edges.map(([source, target]) => {
            const a = positions.get(source)!;
            const b = positions.get(target)!;
            return [Math.min(a, b), Math.max(a, b)];
        });

        let crossings = 0;
        let length = 0;

        for (let i = 0; i < spans.length; i++) {
            const [a, b] = spans[i];
            length += 2 - 2 * Math.cos(((b - a) * Math.PI * 2) / order.length);

            for (let j = i + 1; j < spans.length; j++) {
                const [c, d] = spans[j];

                if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) {
                    crossings++;
                }
            }
        }

        return crossings * (edges.length * 4 + 1) + length;
    };

    let best = score();
    let budget = 2000;

    for (let pass = 0; pass < 4 && budget > 0; pass++) {
        let improved = false;

        for (let i = 0; i < order.length && budget > 0; i++) {
            for (let j = i + 1; j < order.length && budget > 0; j++) {
                budget--;
                [order[i], order[j]] = [order[j], order[i]];
                const next = score();

                if (next < best - 0.000001) {
                    best = next;
                    improved = true;
                } else {
                    [order[i], order[j]] = [order[j], order[i]];
                }
            }
        }

        if (!improved) {
            break;
        }
    }

    const byId = new Map(members.map((node) => [node.id, node]));
    return order.map((id) => byId.get(id)!);
}
