// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { QuoteSpotlight } from './components/QuoteSpotlight';
import { PinnedQuoteCard } from './components/PinnedQuoteCard';
import { QuoteSpotlightSearch } from './components/QuoteSpotlightSearch';
import type { QuoteItem } from './types/QuoteItem';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrollIntoView; the search list calls it on the selected row.
Element.prototype.scrollIntoView = () => undefined;

let root: Root;
let container: HTMLDivElement;

/** A market item whose numbers never arrived. useMacroData has no shape gate
 *  (unlike useMarketData.usableQuotes), and a render throw on /present blanks
 *  the whole projector — so every formatter must survive this. */
const broken = {
    id: 'X', name: 'Broken', group: 'market',
    value: undefined as unknown as number,
    changePct: undefined as unknown as number,
} as QuoteItem;

describe('sweep 22 — quote formatters never throw on a non-finite value', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        vi.restoreAllMocks();
    });

    it('QuoteSpotlight renders a dash instead of throwing', () => {
        expect(() => act(() => {
            root.render(<QuoteSpotlight item={broken} lang="en" onDismiss={() => undefined} />);
        })).not.toThrow();
        expect(container.textContent).toContain('—');
    });

    it('PinnedQuoteCard renders a dash instead of throwing', () => {
        expect(() => act(() => {
            root.render(<PinnedQuoteCard item={broken} lang="en" showDivider={false} onRemove={() => undefined} />);
        })).not.toThrow();
        expect(container.textContent).toContain('—');
    });

    it('QuoteSpotlightSearch lists the item with dashes instead of throwing', () => {
        expect(() => act(() => {
            root.render(<QuoteSpotlightSearch items={[broken]} lang="en" onCommit={() => undefined} onClose={() => undefined} />);
        })).not.toThrow();
        expect(container.textContent).toContain('Broken');
        expect(container.textContent).toContain('—');
    });
});

describe('sweep 22 — search selection survives a shrinking result list', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    const item = (id: string): QuoteItem => ({ id, name: id, group: 'market', value: 1, changePct: 0 });
    const key = (k: string) => {
        const input = container.querySelector('input')!;
        act(() => {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        });
    };

    it('Enter picks the last remaining row after a refresh shortened the list', () => {
        const onCommit = vi.fn();
        const render = (items: QuoteItem[]) => act(() => {
            root.render(<QuoteSpotlightSearch items={items} lang="en" onCommit={onCommit} onClose={() => undefined} />);
        });
        render([item('A'), item('B'), item('C')]);
        key('ArrowDown'); key('ArrowDown');           // highlight C (index 2)
        render([item('A')]);                          // refresh: C and B gone
        key('Enter');                                 // index 2 is now out of range
        expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
    });
});
