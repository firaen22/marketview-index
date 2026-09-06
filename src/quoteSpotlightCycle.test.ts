import { describe, it, expect } from 'vitest';

import { nextSpotlightItem } from './quoteSpotlightCycle';

interface Item { id: string; value: string }

const A: Item = { id: 'a', value: 'A' };
const B: Item = { id: 'b', value: 'B' };
const C: Item = { id: 'c', value: 'C' };

describe('nextSpotlightItem', () => {
    const items: readonly Item[] = [A, B, C];

    it('returns null for an empty list', () => {
        expect(nextSpotlightItem([], 'a', 'forward')).toBeNull();
    });

    it('returns null for a single-item list', () => {
        expect(nextSpotlightItem([A], 'a', 'forward')).toBeNull();
    });

    it('returns the next item when moving forward mid-list', () => {
        expect(nextSpotlightItem(items, 'a', 'forward')).toBe(B);
    });

    it('wraps forward from last to first', () => {
        expect(nextSpotlightItem(items, 'c', 'forward')).toBe(A);
    });

    it('returns the previous item when moving back mid-list', () => {
        expect(nextSpotlightItem(items, 'b', 'back')).toBe(A);
    });

    it('wraps back from first to last', () => {
        expect(nextSpotlightItem(items, 'a', 'back')).toBe(C);
    });

    it('returns null when currentId is not in the list', () => {
        expect(nextSpotlightItem(items, 'x', 'forward')).toBeNull();
    });

    it('resolves duplicate ids against the first match', () => {
        const dup: readonly Item[] = [
            { id: 'dup', value: 'first' },
            { id: 'dup', value: 'second' },
            { id: 'uniq', value: 'third' },
        ];
        expect(nextSpotlightItem(dup, 'dup', 'forward')?.value).toBe('second');
    });

    it('returns null for a null list', () => {
        expect(nextSpotlightItem(null, 'a', 'forward')).toBeNull();
    });

    it('returns null for an undefined list', () => {
        expect(nextSpotlightItem(undefined, 'a', 'forward')).toBeNull();
    });

    it('returns null for a non-array value', () => {
        expect(nextSpotlightItem({} as unknown as readonly Item[], 'a', 'forward')).toBeNull();
    });

    it('treats an unknown direction as forward', () => {
        expect(nextSpotlightItem(items, 'b', 'up' as 'forward')).toBe(C);
    });
});
