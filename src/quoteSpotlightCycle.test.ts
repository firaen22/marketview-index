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

    it('steps through a two-item list in both directions', () => {
        const twoItems: readonly Item[] = [A, B];
        expect(nextSpotlightItem(twoItems, 'a', 'forward')).toBe(B);
        expect(nextSpotlightItem(twoItems, 'b', 'forward')).toBe(A);
        expect(nextSpotlightItem(twoItems, 'a', 'back')).toBe(B);
        expect(nextSpotlightItem(twoItems, 'b', 'back')).toBe(A);
    });

    it('returns null when id differs only by case', () => {
        expect(nextSpotlightItem(items, 'A', 'forward')).toBeNull();
        expect(nextSpotlightItem(items, 'B', 'back')).toBeNull();
    });

    it('returns null when id differs only by surrounding whitespace', () => {
        expect(nextSpotlightItem(items, ' a', 'forward')).toBeNull();
        expect(nextSpotlightItem(items, 'a ', 'forward')).toBeNull();
        expect(nextSpotlightItem(items, ' a ', 'back')).toBeNull();
    });

    it('handles frozen arrays and frozen items', () => {
        const frozenList = Object.freeze([
            Object.freeze({ id: 'f1', value: 'First' }),
            Object.freeze({ id: 'f2', value: 'Second' }),
        ]);
        expect(nextSpotlightItem(frozenList, 'f1', 'forward')).toBe(frozenList[1]);
        expect(nextSpotlightItem(frozenList, 'f2', 'back')).toBe(frozenList[0]);
    });

    it('preserves references for items holding extra fields', () => {
        interface RichItem {
            id: string;
            value: string;
            metadata: { count: number };
            tags: readonly string[];
        }
        const richA: RichItem = { id: 'r1', value: 'R1', metadata: { count: 10 }, tags: ['alpha'] };
        const richB: RichItem = { id: 'r2', value: 'R2', metadata: { count: 20 }, tags: ['beta'] };
        const richList: readonly RichItem[] = [richA, richB];

        const forwardResult = nextSpotlightItem(richList, 'r1', 'forward');
        expect(forwardResult).toBe(richB);
        expect(forwardResult?.metadata.count).toBe(20);
        expect(forwardResult?.tags).toEqual(['beta']);

        const backResult = nextSpotlightItem(richList, 'r2', 'back');
        expect(backResult).toBe(richA);
        expect(backResult?.metadata.count).toBe(10);
    });

    it('treats empty string direction as forward', () => {
        expect(nextSpotlightItem(items, 'a', '' as unknown as 'forward')).toBe(B);
    });

    it('treats undefined direction as forward', () => {
        expect(nextSpotlightItem(items, 'a', undefined as unknown as 'forward')).toBe(B);
    });

    it('steps from matching empty string id', () => {
        const withEmptyId: readonly Item[] = [
            { id: '', value: 'empty' },
            { id: 'b', value: 'B' },
        ];
        expect(nextSpotlightItem(withEmptyId, '', 'forward')).toBe(withEmptyId[1]);
        expect(nextSpotlightItem(withEmptyId, '', 'back')).toBe(withEmptyId[1]);
    });

    it('resolves duplicate ids against first match when stepping back', () => {
        const dup: readonly Item[] = [
            { id: 'dup', value: 'first' },
            { id: 'dup', value: 'second' },
            { id: 'uniq', value: 'third' },
        ];
        expect(nextSpotlightItem(dup, 'dup', 'back')?.value).toBe('third');
    });
});
