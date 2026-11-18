export function wrapLabel(text: string, maxWidth: number, measure: (text: string) => number) {
    const lines: string[] = [];
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

    for (const paragraph of text.split(/\r?\n/u)) {
        let line = '';

        for (const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
            const joined = line ? `${line} ${word}` : word;

            if (measure(joined) <= maxWidth) {
                line = joined;
                continue;
            }

            if (line) {
                lines.push(line);
                line = '';
            }

            if (measure(word) <= maxWidth) {
                line = word;
                continue;
            }

            for (const { segment } of segmenter.segment(word)) {
                if (line && measure(line + segment) > maxWidth) {
                    lines.push(line);
                    line = '';
                }

                line += segment;
            }
        }

        lines.push(line);
    }

    return {
        text: lines.join('\n'),
        width: Math.max(0, ...lines.map(measure)),
        lines: lines.length,
    };
}
