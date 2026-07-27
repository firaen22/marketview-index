// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMarketData } from './useMarketData';
import { marketCacheKey } from '../settings';
import type { IndexData } from '../types';

/**
 * Regression coverage for the worldmonitor-inspired freshness state (dataMode /
 * lastUpdatedAt) added alongside holiday-aware market sessions. `error`'s
 * existing meaning must not change for FundsPage/HeatmapPage, which gate on it.
 */

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: () => Promise.resolve(body),
    } as unknown as Response;
}

/** Stable identity — see the FundsPage-contract test below. */
const MATCHES_NOTHING = () => false;

/** Full-shape quote: usableQuotes gates every field renderers dereference. */
function item(symbol: string, price = 100, changePercent = 1): IndexData {
    return {
        symbol, name: symbol, price, changePercent,
        change: 1, ytdChange: 5, ytdChangePercent: 5,
        open: price, high: price, low: price,
        history: [], category: 'US',
    } as IndexData;
}

describe('useMarketData freshness (dataMode)', () => {
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

    it('a fresh live fetch reports dataMode="live" and error=false', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [item('AAPL')],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.dataMode).toBe('live');
        expect(latest.error).toBe(false);
        expect(latest.lastUpdatedAt).toBe(Date.parse('2026-07-20T00:00:00.000Z'));
    });

    it('a warm-cache success reports dataMode="cached"', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'server_cache', timestamp: '2026-07-20T00:00:00.000Z',
            data: [item('AAPL')],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.dataMode).toBe('cached');
        expect(latest.error).toBe(false);
    });

    it('server_stale_cache ADOPTS the frozen data, sets dataMode="stale", but keeps error=true (unchanged contract)', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: false, source: 'server_stale_cache', timestamp: '2026-07-19T00:00:00.000Z',
            data: [item('MSFT')], error: 'Failed to fetch market data',
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        // The pre-existing bug: this used to be dropped entirely (data stayed []).
        expect(latest.data.map(d => d.symbol)).toEqual(['MSFT']);
        expect(latest.dataMode).toBe('stale');
        expect(latest.error).toBe(true);
    });

    it('total failure (no data, no cache) reports dataMode="unavailable" and keeps prior data', async () => {
        localStorage.setItem(marketCacheKey('YTD', 'en'), JSON.stringify({ data: [item('SEED')] }));
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: false, error: 'API Error and No Cache Available.',
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.dataMode).toBe('unavailable');
        expect(latest.error).toBe(true);
    });

    it('a non-OK HTTP response reports dataMode="unavailable"', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({}, false, 500))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.dataMode).toBe('unavailable');
        expect(latest.error).toBe(true);
    });

    it('a network throw reports dataMode="unavailable"', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.dataMode).toBe('unavailable');
        expect(latest.error).toBe(true);
    });

    it('drops non-finite quotes before adopting data, and treats an all-poisoned payload as unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [item('GOOD', 100, 1), { symbol: 'BAD', price: NaN, changePercent: 1 }, { symbol: 'BAD2', price: 100, changePercent: Infinity }],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['GOOD']);

        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [{ symbol: 'ONLY_BAD', price: NaN, changePercent: NaN }],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: '1D' })); });
        expect(latest.dataMode).toBe('unavailable');
        expect(latest.error).toBe(true);
    });

    it('an empty result caused by the caller\'s filter is NOT an error (FundsPage contract)', async () => {
        // FundsPage passes filter: item.category === 'Fund'. A payload of healthy
        // index quotes with no Fund entries is a normal "no funds" answer — it must
        // adopt [] with error=false, not raise FundsPage's error banner.
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [item('AAPL')],
        }))));
        // Hoisted, not inline: an unstable `filter` identity refetches forever
        // (the hook documents this at useMarketData.ts:7).
        function Filtered() {
            latest = useMarketData({ range: 'YTD', lang: 'en', filter: MATCHES_NOTHING });
            return null;
        }
        await act(async () => { root.render(createElement(Filtered)); });
        expect(latest.data).toEqual([]);
        expect(latest.error).toBe(false);
        expect(latest.dataMode).toBe('live');
    });

    it('a partial quote object (fields renderers dereference missing) is dropped, never adopted', async () => {
        // {symbol, price, changePercent} alone passes a price/changePercent-only
        // gate, then MarketStatCard throws on history.length / ytdChangePercent
        // .toFixed(2) and blanks the projector. The gate must cover every field
        // a renderer consumes destructively.
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [{ symbol: 'PARTIAL', price: 100, changePercent: 1 }, item('FULL')],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['FULL']);
    });

    it('a non-boolean success value is never treated as a fresh success', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: 'false', source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [item('SUSPECT')],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        // Malformed envelope → the failure path, not a clean success.
        expect(latest.error).toBe(true);
    });

    it('a corrupt localStorage seed never paints NaN quotes before the first fetch', async () => {
        localStorage.setItem(marketCacheKey('YTD', 'en'), JSON.stringify({
            data: [{ symbol: 'POISON', price: NaN, changePercent: 1 }, item('SAFE')],
        }));
        // Fetch that never resolves: assert the SEED alone, pre-fetch.
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['SAFE']);
    });

    it('a malformed (non-object) array element does not throw, and is dropped', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({
            success: true, source: 'live_api_cached', timestamp: '2026-07-20T00:00:00.000Z',
            data: [null, 'not-an-object', 42, item('OK')],
        }))));
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(latest.data.map(d => d.symbol)).toEqual(['OK']);
        expect(latest.dataMode).toBe('live');
    });
});
