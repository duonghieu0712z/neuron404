import { webHref } from '#lib/links';

export function citationKey(number: string, href: string) {
    return `${number}:${webHref(href) ?? href}`;
}

export function citationDescription(title: string | null | undefined) {
    return (title ?? '').replace(/Snapshot sha256:[a-f0-9]{64};?\s*/g, '').trim();
}
