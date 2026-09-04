import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round 2 of sweep 21: the defects the codex + grok reviews of the round-1
 * fixes turned up. Both families converged on F5 (the batch-quote catch)
 * having traded a good warm-cache failover for a function-budget overrun.
 */

const state = vi.hoisted(() => ({
    emptyChartSymbol: null as string | null,
    chartSignals: [] as any[],
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
            state.chartSignals.push(args[2]?.fetchOptions?.signal);
            if (args[0] === state.emptyChartSymbol) return { quotes: [] };
            return { quotes: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 },
                { date: new Date(), close: 100 },
            ] };
        }
    },
}));

const { default: handler, fetchAllIndices, mergeCarriedForward } = await import('./market-data');

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

/** A full-shape row, so tests can vary exactly one field. */
function goodRow(symbol: string) {
    return {
        symbol, price: 321, change: 1, changePercent: 1, open: 320, high: 322, low: 319,
        ytdChange: 1, ytdChangePercent: 1, history: [{ value: 321, date: new Date().toISOString() }],
    };
}

describe('sweep 21 round 2 — quote failure must not cost the frozen cache', () => {
    beforeEach(() => {
        state.emptyChartSymbol = null;
        state.chartSignals = [];
        state.redis.get.mockReset().mockResolvedValue(null);
        state.redis.set.mockReset().mockResolvedValue('OK');
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
    });

    it('serves the frozen cache fast instead of running charts, when a cache exists', async () => {
        // Round 1 made a quote failure continue into 24 chart fetches even with
        // a warm cache. That pushes the request into Vercel's ~10s kill, and a
        // killed function never runs the catch — so the projector gets NOTHING
        // where it used to get real data badged Delayed.
        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function () { throw new Error('The operation was aborted due to timeout'); };
        state.redis.get.mockResolvedValue(JSON.stringify({
            success: true, timestamp: new Date().toISOString(), data: [goodRow('^HSI')],
        }));
        try {
            const res = makeRes();
            await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

            expect(res.body.source).toBe('server_stale_cache');
            expect(res.body.data.find((i: any) => i.symbol === '^HSI').price).toBe(321);
            // The whole point: it bailed out before spending the chart budget.
            expect(state.chartSignals.length).toBe(0);
        } finally {
            YF.prototype.quote = origQuote;
        }
    });

    it('still degrades to chart-only when there is no cache to fall back to', async () => {
        // The round-1 improvement must survive: a cold cache has nothing to
        // serve, so chart-only beats 'No Cache Available'.
        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function () { throw new Error('The operation was aborted due to timeout'); };
        try {
            const res = makeRes();
            await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

            expect(res.body.success).toBe(true);
            expect(res.body.data.length).toBeGreaterThan(20);
            expect(state.chartSignals.length).toBeGreaterThan(20);
        } finally {
            YF.prototype.quote = origQuote;
        }
    });

    it('gives the whole chart phase ONE shared deadline, not 5s per request', async () => {
        // A twFundId entry awaits Yahoo TW and only then its chart fallback.
        // With per-request budgets that one symbol can spend 10s on top of the
        // 5s quote — ~15s against a ~10s function budget.
        await fetchAllIndices('1M');

        expect(state.chartSignals.length).toBeGreaterThan(0);
        const distinct = new Set(state.chartSignals);
        expect(distinct.size).toBe(1);
        expect([...distinct][0]).toBeInstanceOf(AbortSignal);
    });
});

describe('sweep 21 round 2 — never remember a hole, never carry a crashy row', () => {
    beforeEach(() => {
        state.emptyChartSymbol = null;
        state.chartSignals = [];
        state.redis.get.mockReset().mockResolvedValue(null);
        state.redis.set.mockReset().mockResolvedValue('OK');
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
    });

    it('does not cache an incomplete payload, which would persist a tile-shaped hole for an hour', async () => {
        // quote fails AND one chart is empty -> that symbol is `continue`d, so
        // it is not `estimated` and the old check saw a "clean" payload. The
        // tile is absent, so it cannot carry a Delayed badge either.
        // Baseline first, while everything still works: a full run returns
        // every symbol, so the degraded run below must come up exactly one short.
        const fullCount = (await fetchAllIndices('YTD')).length;

        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function () { throw new Error('aborted'); };
        state.emptyChartSymbol = '^HSI';
        state.redis.set.mockClear();
        try {
            const res = makeRes();
            await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

            expect(res.body.data.find((i: any) => i.symbol === '^HSI')).toBeUndefined();
            expect(res.body.data.length).toBe(fullCount - 1);
            expect(state.redis.set).not.toHaveBeenCalledWith(
                expect.stringContaining('global_market_cache_yfinance_v1'),
                expect.anything(),
                expect.objectContaining({ ex: 3600 }),
            );
        } finally {
            YF.prototype.quote = origQuote;
        }
    });

    it('refuses to carry a cached row that would throw during card render', () => {
        // `/` renders MarketStatCard through useDashboardData, which applies no
        // usableQuotes gate, and the card dereferences ytdChangePercent.toFixed
        // and low/high.toLocaleString() unguarded.
        const { ytdChangePercent, ...missingYtd } = goodRow('^HSI');
        const fresh = [{ symbol: '^GSPC', price: 1 }];

        expect(mergeCarriedForward(fresh, [missingYtd])).toEqual(fresh);
        expect(mergeCarriedForward(fresh, [{ ...goodRow('^HSI'), history: 'nope' }])).toEqual(fresh);
        // A well-formed row is still carried, badged stale.
        expect(mergeCarriedForward(fresh, [goodRow('^HSI')])).toEqual([
            { symbol: '^GSPC', price: 1 },
            { ...goodRow('^HSI'), stale: true },
        ]);
    });

    it('badges an estimated INDEX stale, not just an estimated fund', async () => {
        // Its ytdChange is synthesised from fiftyTwoWeekLow and its sparkline is
        // empty, but no client reads `estimated` — so without a badge the
        // invented figure renders as fact.
        state.emptyChartSymbol = '^HSI';
        const data = await fetchAllIndices('1M');
        const hsi = data.find((i: any) => i.symbol === '^HSI')!;

        expect(hsi.estimated).toBe(true);
        expect(hsi.stale).toBe(true);
    });
});
