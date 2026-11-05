import { parsePresentIndexCategory, type PresentIndexCategoryFilter } from '../lib/presentIndexCategory';

export type EmbedCategory = PresentIndexCategoryFilter;

export function parseEmbedCategory(value: unknown): EmbedCategory | null {
    return parsePresentIndexCategory(value);
}
