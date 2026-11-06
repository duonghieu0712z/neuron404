import { Lexer, Parser } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function renderMarkdownBlocks(
    content: string,
    neuronHref: (id: string) => string,
    fragment = false,
) {
    if (fragment) {
        const fences = [...content.matchAll(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/gm)];
        const first = fences[0];
        // Restore an opening fence when an excerpt starts inside a fenced block.
        if (
            fences.length % 2 === 1 &&
            first &&
            !first[2].trim() &&
            content.slice(0, first.index).trim()
        )
            content = `${first[1]}\n${content}`;
    }
    return Lexer.lex(content, { gfm: true })
        .filter((token) => token.type !== 'space')
        .map((token) => ({
            scrollable: token.type === 'code' || token.type === 'table',
            html: sanitizeHtml(Parser.parse([token], { gfm: true }), {
                allowedTags: sanitizeHtml.defaults.allowedTags,
                allowedAttributes: {
                    a: ['href', 'title', 'data-neuron-id'],
                    code: ['class'],
                    th: ['align'],
                    td: ['align'],
                    ol: ['start'],
                },
                allowedSchemes: ['http', 'https', 'mailto'],
                allowProtocolRelative: false,
                transformTags: {
                    a: (tagName, attributes) => {
                        const match = /^neuron:([a-zA-Z0-9_-]+)$/.exec(attributes.href ?? '');
                        const { href, title } = attributes;
                        return {
                            tagName,
                            attribs: match
                                ? {
                                      href: neuronHref(match[1]),
                                      'data-neuron-id': match[1],
                                      ...(title ? { title } : {}),
                                  }
                                : { ...(href ? { href } : {}), ...(title ? { title } : {}) },
                        };
                    },
                },
            }),
        }));
}
