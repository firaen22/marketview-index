import type { IndexCategory, TimeRange } from './types';
import { PRESENT_INDEX_CATEGORIES } from '../lib/presentIndexCategory';

export const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];

export const CATEGORIES_ORDER: ('All' | IndexCategory)[] = [...PRESENT_INDEX_CATEGORIES];

export type StripMode = 'compact' | 'full' | 'hidden';
export const STRIP_MODES: StripMode[] = ['compact', 'full', 'hidden'];
