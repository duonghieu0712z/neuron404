import { Lexer } from 'marked';

const TARGET_LENGTH = 1200;
const MAX_LENGTH = 2000;

/** Keep Markdown blocks intact where possible and preserve exact source substrings. */
export function evidencePassages(text: string): string[] {
    const tokens = Lexer.lex(text, { gfm: true }).map((token) => token.raw);
    const blocks = tokens.join('') === text ? tokens : [text];
    const segments: string[] = [];
    const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    for (const block of blocks) {
        if (block.length <= MAX_LENGTH) {
            segments.push(block);
            continue;
        }
        for (const line of block.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
            if (line.length <= MAX_LENGTH) {
                segments.push(line);
                continue;
            }
            for (const { segment } of sentences.segment(line)) {
                let remaining = segment;
                while (remaining.length > MAX_LENGTH) {
                    const prefix = remaining.slice(0, MAX_LENGTH);
                    const boundary = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\t'));
                    let end = boundary > TARGET_LENGTH / 2 ? boundary + 1 : MAX_LENGTH;
                    // Avoid cutting a UTF-16 surrogate pair in an unusually long token.
                    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
                    segments.push(remaining.slice(0, end));
                    remaining = remaining.slice(end);
                }
                if (remaining) segments.push(remaining);
            }
        }
    }
    const result: string[] = [];
    let pending = '';
    for (const segment of segments) {
        if (pending && pending.length + segment.length > TARGET_LENGTH) {
            result.push(pending);
            pending = '';
        }
        pending += segment;
    }
    if (pending) result.push(pending);
    // Whitespace-only gaps need no independent reference, but remain in adjacent passages.
    return result.filter((passage) => passage.trim());
}
