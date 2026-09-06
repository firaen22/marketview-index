// @vitest-environment node
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { spotlightCycleList, spotlightGestureTarget } from './PresentationPage';

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

describe('spotlightGestureTarget', () => {
    it('returns spotlight when overlays are all false', () => {
        const item = { id: 'q1' } as any;
        const result = spotlightGestureTarget(item, {
            isPickerOpen: false,
            isSearchOpen: false,
            chartOpen: false,
            briefPanelOpen: false,
            glossaryPanelOpen: false,
            editorOpen: false,
        });
        expect(result).toBe(item);
    });

    it('returns null when any overlay is open', () => {
        const item = { id: 'q1' } as any;
        const allClosed = {
            isPickerOpen: false,
            isSearchOpen: false,
            chartOpen: false,
            briefPanelOpen: false,
            glossaryPanelOpen: false,
            editorOpen: false,
        };
        expect(spotlightGestureTarget(item, { ...allClosed, isPickerOpen: true })).toBe(null);
        expect(spotlightGestureTarget(item, { ...allClosed, isSearchOpen: true })).toBe(null);
        expect(spotlightGestureTarget(item, { ...allClosed, chartOpen: true })).toBe(null);
        expect(spotlightGestureTarget(item, { ...allClosed, briefPanelOpen: true })).toBe(null);
        expect(spotlightGestureTarget(item, { ...allClosed, glossaryPanelOpen: true })).toBe(null);
        expect(spotlightGestureTarget(item, { ...allClosed, editorOpen: true })).toBe(null);
    });

    it('returns null when spotlight is null', () => {
        const result = spotlightGestureTarget(null, {
            isPickerOpen: false,
            isSearchOpen: false,
            chartOpen: false,
            briefPanelOpen: false,
            glossaryPanelOpen: false,
            editorOpen: false,
        });
        expect(result).toBe(null);
    });
});


// sweep 22: Escape used to dismiss the z-40 spotlight BEFORE checking the z-50
// overlays stacked above it, so with a picker/brief/glossary/editor open the
// first Escape closed a card nobody could see and the modal stayed put.
import { presentEscapeTarget } from './PresentationPage';

describe('presentEscapeTarget', () => {
    const none = {
        chartOpen: false, isSearchOpen: false, isPickerOpen: false,
        briefPanelOpen: false, glossaryPanelOpen: false, editorOpen: false, spotlightOpen: false,
    };

    it('closes the overlay stacked above the spotlight, not the spotlight', () => {
        expect(presentEscapeTarget({ ...none, spotlightOpen: true, isPickerOpen: true })).toBe('picker');
        expect(presentEscapeTarget({ ...none, spotlightOpen: true, briefPanelOpen: true })).toBe('brief');
        expect(presentEscapeTarget({ ...none, spotlightOpen: true, glossaryPanelOpen: true })).toBe('glossary');
        expect(presentEscapeTarget({ ...none, spotlightOpen: true, editorOpen: true })).toBe('editor');
        expect(presentEscapeTarget({ ...none, spotlightOpen: true, isSearchOpen: true })).toBe('search');
    });

    it('closes overlays in render order when two coexist', () => {
        expect(presentEscapeTarget({ ...none, isSearchOpen: true, isPickerOpen: true })).toBe('picker');
        expect(presentEscapeTarget({ ...none, glossaryPanelOpen: true, editorOpen: true })).toBe('editor');
        expect(presentEscapeTarget({ ...none, briefPanelOpen: true, editorOpen: true })).toBe('brief');
    });

    it('closes the spotlight when it is the topmost layer', () => {
        expect(presentEscapeTarget({ ...none, spotlightOpen: true })).toBe('spotlight');
    });

    it('leaves the chart modal to its own Escape handler', () => {
        expect(presentEscapeTarget({ ...none, chartOpen: true, spotlightOpen: true })).toBe(null);
    });

    it('falls through to the hints when nothing is open', () => {
        expect(presentEscapeTarget(none)).toBe('hints');
    });
});

// Arrows and trackpad swipes with a z-50 overlay open (picker, search, chart,
// brief, glossary, editor) used to fall through to the PDF: the modal
// swallowed nothing, so a swipe over the picker list flipped the live deck
// behind it and ArrowRight on a focused picker button did the same.
import { presentNavTarget } from './PresentationPage';

describe('presentNavTarget', () => {
    const none = {
        chartOpen: false, isSearchOpen: false, isPickerOpen: false,
        briefPanelOpen: false, glossaryPanelOpen: false, editorOpen: false,
    };
    const spot = { id: 'HSI' };

    it('never cycles a spotlight hidden under any overlay', () => {
        for (const flag of Object.keys(none) as (keyof typeof none)[]) {
            expect(presentNavTarget(spot, { ...none, [flag]: true })).toBe(null);
        }
    });

    it('leaves the deck alone under a full-screen overlay', () => {
        for (const flag of ['isPickerOpen', 'isSearchOpen', 'chartOpen', 'briefPanelOpen'] as const) {
            expect(presentNavTarget(null, { ...none, [flag]: true })).toBe(null);
        }
    });

    it('still drives the deck beside the glossary/editor side drawers (z-40, deck visible)', () => {
        expect(presentNavTarget(null, { ...none, glossaryPanelOpen: true })).toBe('deck');
        expect(presentNavTarget(null, { ...none, editorOpen: true })).toBe('deck');
    });

    it('cycles the spotlight when it is the topmost layer', () => {
        expect(presentNavTarget(spot, none)).toBe('spotlight');
    });

    it('drives the deck when nothing is on top of it', () => {
        expect(presentNavTarget(null, none)).toBe('deck');
    });
});
