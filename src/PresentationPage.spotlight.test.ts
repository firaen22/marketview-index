// @vitest-environment node
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { spotlightCycleList } from './PresentationPage';

vi.hoisted(() => {
    (globalThis as typeof globalThis & { DOMMatrix: typeof DOMMatrix }).DOMMatrix = class {} as typeof DOMMatrix;
});

describe('spotlightCycleList', () => {
    const briefItems: readonly { id: string }[] = [{ id: 'brief-1' }, { id: 'brief-2' }];
    const pinned: readonly { id: string }[] = [{ id: 'pinned-1' }, { id: 'pinned-2' }];

    it('returns briefItems when the spotlight id is present', () => {
        expect(spotlightCycleList('brief-1', briefItems, pinned)).toBe(briefItems);
    });

    it('returns pinned when the spotlight id is absent from briefItems', () => {
        expect(spotlightCycleList('pinned-1', briefItems, pinned)).toBe(pinned);
    });

    it('returns pinned when the spotlight id is in neither list', () => {
        expect(spotlightCycleList('missing', briefItems, pinned)).toBe(pinned);
    });

    it('returns pinned when briefItems is empty', () => {
        expect(spotlightCycleList('missing', [], pinned)).toBe(pinned);
    });

    it('returns the empty pinned array when both lists are empty', () => {
        const emptyPinned: readonly { id: string }[] = [];
        expect(spotlightCycleList('missing', [], emptyPinned)).toBe(emptyPinned);
    });

    it('returns briefItems when the id appears in both briefItems and pinned', () => {
        const sharedId = 'shared-1';
        const briefWithShared: readonly { id: string }[] = [{ id: sharedId }, { id: 'brief-2' }];
        const pinnedWithShared: readonly { id: string }[] = [{ id: sharedId }, { id: 'pinned-2' }];
        expect(spotlightCycleList(sharedId, briefWithShared, pinnedWithShared)).toBe(briefWithShared);
    });

    it('returns pinned when briefItems is empty and pinned has exactly one entry', () => {
        const singlePinned: readonly { id: string }[] = [{ id: 'solo' }];
        expect(spotlightCycleList('solo', [], singlePinned)).toBe(singlePinned);
        expect(spotlightCycleList('other', [], singlePinned)).toBe(singlePinned);
    });

    it('returns pinned when spotlight id differs only by case from briefItems', () => {
        expect(spotlightCycleList('BRIEF-1', briefItems, pinned)).toBe(pinned);
        expect(spotlightCycleList('Brief-1', briefItems, pinned)).toBe(pinned);
    });

    it('returns pinned when spotlight id differs only by surrounding whitespace from briefItems', () => {
        expect(spotlightCycleList(' brief-1', briefItems, pinned)).toBe(pinned);
        expect(spotlightCycleList('brief-1 ', briefItems, pinned)).toBe(pinned);
        expect(spotlightCycleList(' brief-1 ', briefItems, pinned)).toBe(pinned);
    });

    it('handles frozen briefItems and pinned arrays', () => {
        const frozenBrief = Object.freeze([{ id: 'fb-1' }, { id: 'fb-2' }]);
        const frozenPinned = Object.freeze([{ id: 'fp-1' }, { id: 'fp-2' }]);
        expect(spotlightCycleList('fb-1', frozenBrief, frozenPinned)).toBe(frozenBrief);
        expect(spotlightCycleList('fp-1', frozenBrief, frozenPinned)).toBe(frozenPinned);
    });

    it('preserves list identity when holding objects with extra fields', () => {
        interface RichSpotlightItem {
            id: string;
            symbol: string;
            price: number;
            details: { category: string };
        }
        const richBrief: readonly RichSpotlightItem[] = [
            { id: 'b1', symbol: 'BRIEF_A', price: 100, details: { category: 'macro' } },
            { id: 'b2', symbol: 'BRIEF_B', price: 200, details: { category: 'equity' } },
        ];
        const richPinned: readonly RichSpotlightItem[] = [
            { id: 'p1', symbol: 'PINNED_A', price: 300, details: { category: 'fx' } },
        ];
        expect(spotlightCycleList('b1', richBrief, richPinned)).toBe(richBrief);
        expect(spotlightCycleList('p1', richBrief, richPinned)).toBe(richPinned);
    });

    it('returns briefItems when matching an empty string id present in briefItems', () => {
        const briefWithEmpty: readonly { id: string }[] = [{ id: '' }, { id: 'b2' }];
        expect(spotlightCycleList('', briefWithEmpty, pinned)).toBe(briefWithEmpty);
    });

    it('returns pinned when spotlight id is empty string not present in briefItems', () => {
        expect(spotlightCycleList('', briefItems, pinned)).toBe(pinned);
    });
});
