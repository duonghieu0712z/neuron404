export function findSourceExcerpt(content: string, passage: string) {
    const fold = (value: string) =>
        value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();

    const terms = new Set(fold(passage).match(/[\p{L}\p{N}]{3,}/gu) ?? []);

    if (!terms.size) {
        return null;
    }

    let best: { start: number; end: number; score: number } | null = null;

    for (const match of content.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
        const words = new Set(fold(match[0]).match(/[\p{L}\p{N}]{3,}/gu) ?? []);
        const matches = [...terms].filter((term) => words.has(term)).length;
        const score = matches / Math.sqrt(Math.max(1, words.size));

        if (matches >= 2 && (!best || score > best.score)) {
            best = { start: match.index, end: match.index + match[0].length, score };
        }
    }

    if (!best) {
        return null;
    }

    return content.slice(best.start, Math.min(best.end, best.start + 1600));
}
