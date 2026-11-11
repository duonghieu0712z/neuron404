import type { Synapse } from '#lib/neuron/schema';

export const NODE_SIZE = 8;
export const LABEL_MAX_LENGTH = 40;
export const LABEL_MAX_WIDTH = 140;

export function shortenLabel(title: string) {
    const characters = Array.from(title);

    return characters.length > LABEL_MAX_LENGTH
        ? `${characters
              .slice(0, LABEL_MAX_LENGTH - 3)
              .join('')
              .trimEnd()}...`
        : title;
}

export const SYNAPSE_COLORS: Record<Synapse['kind'], { dark: string; light: string }> = {
    cites: { dark: '#c98500', light: '#eda100' },
    contradicts: { dark: '#d95926', light: '#eb6834' },
    extends: { dark: '#199e70', light: '#1baf7a' },
    questions: { dark: '#d55181', light: '#e87ba4' },
    supports: { dark: '#3987e5', light: '#2a78d6' },
};

export const GROUNDING_COLORS: Record<string, { dark: string; light: string }> = {
    sourced: { dark: '#7cafff', light: '#356bd6' },
    inferred: { dark: '#d8ad65', light: '#a16a17' },
    assumption: { dark: '#c19aeb', light: '#9053bc' },
};

export const REGION_COLOR = { dark: '#b7c5c0', light: '#506a60' };
