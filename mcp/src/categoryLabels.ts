/**
 * Labels must match `../../lib/presentIndexCategory.ts`.
 * Enforced by `../src/presentIndexCategory.parity.test.ts` in the main package.
 */
export const PRESENT_INDEX_CATEGORY_VALUES = [
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

export type PresentIndexCategoryValue = typeof PRESENT_INDEX_CATEGORY_VALUES[number];
