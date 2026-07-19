import type { IndexCategory, TimeRange } from './types';

export const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];

export const CATEGORIES_ORDER: ('All' | IndexCategory)[] = [
    'All', 'US', 'Europe', 'Asia', 'Fund', 'Commodity', 'Crypto', 'Currency', 'Volatility',
];

export type StripMode = 'compact' | 'full' | 'hidden';
export const STRIP_MODES: StripMode[] = ['compact', 'full', 'hidden'];
