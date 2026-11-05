import { CATEGORIES_ORDER } from './constants';
import type { IndexCategory } from './types';

export type EmbedCategory = 'All' | IndexCategory;

export function parseEmbedCategory(value: unknown): EmbedCategory | null {
    if (typeof value !== 'string') return null;
    if ((CATEGORIES_ORDER as readonly string[]).includes(value)) {
        return value as EmbedCategory;
    }
    return null;
}
