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
});
