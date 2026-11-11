import type { Tokens } from 'marked';

import { Lexer, Parser, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';

import { webHref } from '#lib/links';

import { citationDescription, citationKey } from './markdown/citations';

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
        ) {
            content = `${first[1]}\n${content}`;
        }
    }

    const tokens = Lexer.lex(content, { gfm: true });
    const references = new Map<string, { label: string; description: string }>();

    for (const token of tokens) {
        if (token.type !== 'paragraph' || !token.tokens) {
            continue;
        }

        const number = /^\[(\d+)\]\s*$/.exec(token.tokens[0]?.raw ?? '')?.[1];
        const link = token.tokens[1];

        if (number && link?.type === 'link') {
            references.set(citationKey(number, link.href), {
                label: link.text,
                description:
                    token.tokens
                        .slice(2)
                        .map((part) => part.raw)
                        .join('')
                        .replace(/^\s*[—–-]\s*/, '')
                        .trim() || citationDescription(link.title),
            });
        }
    }

    const renderer = new Renderer();
    const renderLink = renderer.link.bind(renderer);
    renderer.link = (token: Tokens.Link) => {
        const number = /^\[?(\d+)\]?$/.exec(token.text)?.[1];
        const html = renderLink(token);
        return number ? `<sup>${html.replace('<a ', `<a data-citation="${number}" `)}</sup>` : html;
    };

    return tokens
        .filter((token) => token.type !== 'space')
        .map((token) => ({
            scrollable: token.type === 'code' || token.type === 'table',
            html: sanitizeHtml(
                Parser.parse(Object.assign([token], { links: tokens.links }), {
                    gfm: true,
                    renderer,
                }).replace(/\s+(?=<sup><a data-citation="\d+")/g, ''),
                {
                    allowedTags: sanitizeHtml.defaults.allowedTags,
                    allowedAttributes: {
                        a: [
                            'href',
                            'title',
                            'data-neuron-id',
                            'target',
                            'rel',
                            'data-citation',
                            'data-citation-label',
                            'data-citation-description',
                            'aria-label',
                        ],
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

                            const externalHref = href?.startsWith('//')
                                ? webHref(`https:${href}`)
                                : href && webHref(href);

                            const number = /^\d+$/.test(attributes['data-citation'] ?? '')
                                ? attributes['data-citation']
                                : undefined;

                            const reference =
                                number && href
                                    ? references.get(citationKey(number, href))
                                    : undefined;

                            const label =
                                reference?.label ??
                                (externalHref
                                    ? new URL(externalHref).hostname
                                    : `Reference ${number}`);

                            const citationAttributes: Record<string, string> = number
                                ? {
                                      'data-citation': number,
                                      'data-citation-label': label,
                                      'data-citation-description':
                                          reference?.description || citationDescription(title),
                                      'aria-label': `Reference ${number}: ${label}`,
                                  }
                                : {};

                            const titleAttributes: Record<string, string> =
                                title && !number ? { title } : {};

                            return {
                                tagName,
                                attribs: match
                                    ? {
                                          href: neuronHref(match[1]),
                                          'data-neuron-id': match[1],
                                          ...titleAttributes,
                                          ...citationAttributes,
                                      }
                                    : {
                                          ...(href ? { href: externalHref || href } : {}),
                                          ...titleAttributes,
                                          ...citationAttributes,
                                          ...(externalHref
                                              ? { target: '_blank', rel: 'noopener noreferrer' }
                                              : {}),
                                      },
                            };
                        },
                    },
                },
            ),
        }));
}
