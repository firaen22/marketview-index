// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMarketData } from './useMarketData';
import { marketCacheKey } from '../settings';
import type { IndexData } from '../types';

function item(symbol: string, changePercent: number): IndexData {
    return { symbol, name: symbol, price: 100, changePercent } as IndexData;
}

// A fetch that never resolves — keeps the hook in its loading state so we can
// observe what `data` holds mid-refetch (the stale-range window).
function pendingFetch() {
    return vi.fn(() => new Promise<Response>(() => {}));
}

describe('useMarketData range switch', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: ReturnType<typeof useMarketData>;

    beforeEach(() => {
        localStorage.clear();
        container = document.createElement('div');
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        vi.restoreAllMocks();
    });

    function Probe({ range }: { range: string }) {
        latest = useMarketData({ range, lang: 'en' });
        return null;
    }

    it('drops the previous range data when the range changes so a loading guard can show', () => {
        vi.stubGlobal('fetch', pendingFetch());
        // Seed YTD cache; leave 1D uncached.
        localStorage.setItem(marketCacheKey('YTD', 'en'), JSON.stringify({ data: [item('AAPL', 12)] }));

        act(() => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['AAPL']); // seeded from YTD cache

        // Switch to an uncached range while the refetch is still pending.
        act(() => { root.render(createElement(Probe, { range: '1D' })); });
        expect(latest.data).toEqual([]);          // old YTD data cleared, not shown as 1D
        expect(latest.isLoading).toBe(true);       // guard `isLoading && length===0` -> spinner
    });

    it('re-seeds from the new range cache when available', () => {
        vi.stubGlobal('fetch', pendingFetch());
        localStorage.setItem(marketCacheKey('YTD', 'en'), JSON.stringify({ data: [item('AAPL', 12)] }));
        localStorage.setItem(marketCacheKey('1D', 'en'), JSON.stringify({ data: [item('MSFT', -3)] }));

        act(() => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['AAPL']);

        act(() => { root.render(createElement(Probe, { range: '1D' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['MSFT']); // new range's cache, never YTD
    });
});
