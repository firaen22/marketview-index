/** Index embed category chips (`/?embed=1`). Keep in sync with Dashboard filters. */
export const PRESENT_INDEX_CATEGORIES = [
    'All',
    'US',
    'Europe',
    'Asia',
    'Fund',
    'Commodity',
    'Crypto',
    'Currency',
    'Rates',
    'Volatility',
] as const;

export type PresentIndexCategoryFilter = typeof PRESENT_INDEX_CATEGORIES[number];

export function parsePresentIndexCategory(value: unknown): PresentIndexCategoryFilter | null {
    if (typeof value !== 'string') return null;
    if ((PRESENT_INDEX_CATEGORIES as readonly string[]).includes(value)) {
        return value as PresentIndexCategoryFilter;
    }
    return null;
}

export function isPresentIndexCategoryFilter(value: unknown): value is PresentIndexCategoryFilter {
    return parsePresentIndexCategory(value) !== null;
}
