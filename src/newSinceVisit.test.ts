// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeNewSinceVisit, getLastVisitAt, recordVisitNow } from './newSinceVisit';

describe('computeNewSinceVisit', () => {
    it('flags items published after the previous visit as new', () => {
        const items = [
            { id: 'a', time: '2026-07-20T00:00:00.000Z' },
            { id: 'b', time: '2026-07-18T00:00:00.000Z' },
        ];
        const { newIds, seenIds } = computeNewSinceVisit(items, Date.parse('2026-07-19T00:00:00.000Z'));
        expect(newIds).toEqual(new Set(['a']));
        expect(seenIds).toEqual(new Set(['b']));
    });

    it('prevVisitAt <= 0 means "no known previous visit" -> everything is seen', () => {
        const items = [{ id: 'a', time: '2026-07-20T00:00:00.000Z' }];
        expect(computeNewSinceVisit(items, 0).newIds.size).toBe(0);
        expect(computeNewSinceVisit(items, -1).newIds.size).toBe(0);
    });

    it('non-finite or unparseable timestamps fail quiet (seen), never guessed as new', () => {
        const items = [
            { id: 'a', time: 'not-a-date' },
            { id: 'b', time: NaN },
            { id: 'c', time: Infinity },
        ];
        const { newIds, seenIds } = computeNewSinceVisit(items, 1);
        expect(newIds.size).toBe(0);
        expect(seenIds).toEqual(new Set(['a', 'b', 'c']));
    });

    it('accepts epoch-ms numbers as well as ISO strings', () => {
        const items = [{ id: 'a', time: 2_000 }];
        expect(computeNewSinceVisit(items, 1_000).newIds).toEqual(new Set(['a']));
        expect(computeNewSinceVisit(items, 3_000).newIds.size).toBe(0);
    });

    it('a boundary-equal timestamp (exactly at prevVisitAt) is NOT new (strictly after only)', () => {
        const items = [{ id: 'a', time: 1_000 }];
        expect(computeNewSinceVisit(items, 1_000).newIds.size).toBe(0);
    });
});

describe('getLastVisitAt / recordVisitNow', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('returns 0 when nothing has ever been recorded', () => {
        expect(getLastVisitAt()).toBe(0);
    });

    it('round-trips a recorded visit time', () => {
        recordVisitNow(1_753_000_000_000);
        expect(getLastVisitAt()).toBe(1_753_000_000_000);
    });

    it('treats a corrupted stored value as "no known previous visit"', () => {
        localStorage.setItem('marketview-news-last-visit', 'not-a-number');
        expect(getLastVisitAt()).toBe(0);
    });

    it('does not throw when localStorage access fails (e.g. Safari private mode)', () => {
        const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new DOMException('blocked'); },
        });
        try {
            expect(() => getLastVisitAt()).not.toThrow();
            expect(getLastVisitAt()).toBe(0);
            expect(() => recordVisitNow(123)).not.toThrow();
        } finally {
            if (original) Object.defineProperty(window, 'localStorage', original);
        }
    });
});
