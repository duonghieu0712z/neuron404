import type { Neuron, Synapse } from '#lib/neuron/schema';

export interface ProposalPatch {
    title?: string;
    body?: string;
    sources?: string[];
    synapses?: Synapse[];
}

export interface ProposalChange {
    id: string;
    field: string;
    before: string;
    after: string;
}

interface BodyPart {
    text?: string;
    id?: string;
    before?: string;
    after?: string;
}

function bodyParts(before: string, after: string): BodyPart[] {
    if (before === after) {
        return [{ text: before }];
    }

    const a = before.match(/[\s\S]+?(?:\n{2,}|$)/g) ?? [];
    const b = after.match(/[\s\S]+?(?:\n{2,}|$)/g) ?? [];

    if (a.length * b.length > 1_000_000) {
        return [{ id: 'body:0', before, after }];
    }

    const width = b.length + 1;
    const lengths = new Uint32Array((a.length + 1) * width);

    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lengths[i * width + j] =
                a[i] === b[j]
                    ? lengths[(i + 1) * width + j + 1] + 1
                    : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
        }
    }

    const parts: BodyPart[] = [];
    let i = 0;
    let j = 0;
    let index = 0;

    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            parts.push({ text: a[i++] });
            j++;
            continue;
        }

        let removed = '';
        let added = '';

        while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && a[i] === b[j])) {
            if (
                j < b.length &&
                (i === a.length || lengths[i * width + j + 1] >= lengths[(i + 1) * width + j])
            ) {
                added += b[j++];
            } else {
                removed += a[i++];
            }
        }

        parts.push({ id: `body:${index++}`, before: removed, after: added });
    }

    return parts;
}

export function deriveProposalChanges(base: Neuron, patch: ProposalPatch) {
    const changes: ProposalChange[] = [];
    const body = bodyParts(base.body, patch.body ?? base.body);

    for (const part of body) {
        if (part.id) {
            changes.push({
                id: part.id,
                field: 'Content',
                before: part.before!,
                after: part.after!,
            });
        }
    }

    if (patch.title !== undefined && patch.title !== base.title) {
        changes.unshift({ id: 'title', field: 'Title', before: base.title, after: patch.title });
    }

    for (const field of ['sources', 'synapses'] as const) {
        if (!patch[field]) {
            continue;
        }

        const before = base[field];
        const after = patch[field]!;

        const key = (entry: string | Synapse) =>
            typeof entry === 'string' ? entry : `${entry.target}:${entry.kind}`;

        const group = (entries: (string | Synapse)[]) => {
            const result = new Map<string, (string | Synapse)[]>();

            for (const entry of entries) {
                const id = key(entry);

                result.set(id, [...(result.get(id) ?? []), entry]);
            }

            return result;
        };

        const previous = group(before);
        const next = group(after);

        for (const id of new Set([...previous.keys(), ...next.keys()])) {
            const oldValue = previous.get(id);
            const newValue = next.get(id);

            if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
                continue;
            }

            const display = (value: (string | Synapse)[] | undefined) => {
                if (!value) {
                    return '';
                }

                return JSON.stringify(field === 'sources' ? value[0] : value, null, 2);
            };

            changes.push({
                id: `${field}:${id}`,
                field: field === 'sources' ? 'Source' : 'Synapse',
                before: display(oldValue),
                after: display(newValue),
            });
        }
    }

    return {
        changes,
        apply(accepted: Set<string>): Neuron {
            const result = {
                ...base,
                title: accepted.has('title') ? patch.title! : base.title,
                body: body
                    .map((part) => {
                        if (!part.id) {
                            return part.text;
                        }

                        return accepted.has(part.id) ? part.after : part.before;
                    })
                    .join(''),
            };

            for (const field of ['sources', 'synapses'] as const) {
                const selected = changes.filter(
                    (change) => change.id.startsWith(`${field}:`) && accepted.has(change.id),
                );
                let values: (string | Synapse)[] = [...base[field]];

                for (const change of selected) {
                    const previous = change.before ? JSON.parse(change.before) : null;
                    const next = change.after ? JSON.parse(change.after) : null;

                    if (field === 'sources') {
                        if (previous !== null) {
                            values = values.filter((value) => value !== previous);
                        }

                        if (next !== null) {
                            values.push(next as string);
                        }
                    } else {
                        const id = change.id.slice('synapses:'.length);

                        values = values.filter(
                            (value) =>
                                typeof value === 'string' || `${value.target}:${value.kind}` !== id,
                        );

                        if (next !== null) {
                            values.push(...(next as Synapse[]));
                        }
                    }
                }

                if (field === 'sources') {
                    result.sources = values as string[];
                } else {
                    result.synapses = values as Synapse[];
                }
            }

            return result;
        },
    };
}
