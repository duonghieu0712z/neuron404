export function webHref(value: string) {
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
            return url.href;
        }
    } catch {
        return undefined;
    }
    return undefined;
}
