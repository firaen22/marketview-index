import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Carry-forward used to survive exactly one hourly-cache TTL: the hourly
 * key was the only record it merged against, so once that expired
 * (overnight, every night) a still-failing symbol had nothing to be carried
 * from and its tile vanished, unbadged. `last_good_<range>` outlives it.
 */

const state = vi.hoisted(() => ({
    emptyChartSymbol: null as string | null,
    chartCalls: 0,
    store: {} as Record<string, string>,
    redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../lib/redis.js', () => ({ get redis() { return state.redis; } }));

vi.mock('yahoo-finance2', () => ({
    default: class {
        async quote(...args: any[]) {
            return (args[0] as string[]).map((symbol) => ({
                symbol, regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1,
            }));
        }
        async chart(...args: any[]) {
            state.chartCalls++;
            if (args[0] === state.emptyChartSymbol) return { quotes: [] };
            return { quotes: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 },
                { date: new Date(), close: 100 },
            ] };
        }
    },
}));

const { default: handler, LAST_GOOD_KEY, LAST_GOOD_TTL_SECONDS } = await import('./market-data');

const HOURLY_KEY = 'global_market_cache_yfinance_v1_YTD';
const LAST_GOOD_YTD = `${LAST_GOOD_KEY}_YTD`;

function makeReq(url: string) {
    return { url, headers: { host: 'localhost' } } as any;
}
function makeRes() {
    const res: any = { statusCode: 0, body: null, headers: {} };
    res.setHeader = (k: string, v: any) => { res.headers[k] = v; return res; };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return res;
}
function goodRow(symbol: string) {
    return {
        symbol, price: 321, change: 1, changePercent: 1, open: 320, high: 322, low: 319,
        ytdChange: 1, ytdChangePercent: 1, history: [{ value: 321, date: new Date().toISOString() }],
    };
}

describe('carry-forward outlives the hourly cache', () => {
    beforeEach(() => {
        state.emptyChartSymbol = null;
        state.chartCalls = 0;
        state.store = {};
        // A keyed store, so the hourly key and last_good can differ.
        state.redis.get.mockReset().mockImplementation(async (key: string) => state.store[key] ?? null);
        state.redis.set.mockReset().mockResolvedValue('OK');
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
    });

    it('carries a still-failing symbol from last_good after the hourly cache has expired', async () => {
        state.store[LAST_GOOD_YTD] = JSON.stringify({ success: true, data: [goodRow('^HSI')] });
        state.emptyChartSymbol = '^HSI';

        const res = makeRes();
        await handler(makeReq('http://localhost/api/market-data'), res);

        const hsi = res.body.data.find((i: any) => i.symbol === '^HSI');
        expect(hsi.price).toBe(321);
        expect(hsi.history.length).toBeGreaterThan(0);
        expect(hsi.stale).toBe(true);
        expect(hsi.estimated).toBeUndefined();
    });

    it('writes last_good beside the hourly cache, with a much longer TTL', async () => {
        const res = makeRes();
        await handler(makeReq('http://localhost/api/market-data'), res);

        expect(state.redis.set).toHaveBeenCalledWith(HOURLY_KEY, expect.any(String), { ex: 3600 });
        expect(state.redis.set).toHaveBeenCalledWith(LAST_GOOD_YTD, expect.any(String), { ex: LAST_GOOD_TTL_SECONDS });
        expect(LAST_GOOD_TTL_SECONDS).toBeGreaterThan(24 * 3600);
    });

    it('serves last_good as the frozen fallback when the quote fails and the hourly cache is gone', async () => {
        // The round-2 fast failover only counted the hourly cache as a fallback;
        // with it expired, a quote failure ran the whole chart phase instead.
        state.store[LAST_GOOD_YTD] = JSON.stringify({ success: true, data: [goodRow('^HSI')] });
        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function () { throw new Error('The operation was aborted due to timeout'); };
        try {
            const res = makeRes();
            await handler(makeReq('http://localhost/api/market-data'), res);

            expect(res.body.source).toBe('server_stale_cache');
            expect(res.body.data.find((i: any) => i.symbol === '^HSI').price).toBe(321);
            expect(state.chartCalls).toBe(0);
        } finally {
            YF.prototype.quote = origQuote;
        }
    });
});
