import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    dropSymbol: null as string | null,
    emptyChartSymbol: null as string | null,
    quoteCalls: [] as any[][],
    chartCalls: [] as any[][],
    redis: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('../lib/redis.js', () => ({
    get redis() {
        return state.redis;
    },
}));

vi.mock('yahoo-finance2', () => ({
    default: class {
        async quote(...args: any[]) {
            state.quoteCalls.push(args);
            return (args[0] as string[])
                .filter((symbol) => symbol !== state.dropSymbol)
                .map((symbol) => ({ symbol, regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1 }));
        }
        async chart(...args: any[]) {
            state.chartCalls.push(args);
            const symbol = args[0];
            if (symbol === state.emptyChartSymbol) return { quotes: [] };
            const date = symbol === '^HSI'
                ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                : new Date(Date.now());
            return { quotes: [{ date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 }, { date, close: 100 }] };
        }
    },
}));

const {
    default: handler,
    fetchAllIndices,
    mergeCarriedForward,
} = await import('./market-data');

const oldDate = '2026-08-03';

function stubTwFund(fundDates = ['2026-08-02', oldDate]) {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({
        closePrices: ['90', '100'],
        dates: fundDates,
    }))));
}

function makeReq(url: string) {
    return { url, headers: {}, method: 'GET' } as any;
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        body: undefined,
        setHeader: vi.fn(),
        status(status: number) { res.statusCode = status; return res; },
        json(body: unknown) { res.body = body; return res; },
    };
    return res;
}

beforeEach(() => {
    state.dropSymbol = null;
    state.emptyChartSymbol = null;
    state.quoteCalls.length = 0;
    state.chartCalls.length = 0;
    state.redis.get.mockReset().mockResolvedValue(null);
    state.redis.set.mockReset().mockResolvedValue('OK');
    stubTwFund();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('market-data sweep 20 hardening', () => {
    it('passes a fresh AbortSignal module option to quote and every chart call', async () => {
        await fetchAllIndices('YTD');

        expect(state.quoteCalls[0][2].fetchOptions.signal).toBeInstanceOf(AbortSignal);
        expect(state.chartCalls.length).toBeGreaterThan(0);
        for (const args of state.chartCalls) {
            expect(args[2].fetchOptions.signal).toBeInstanceOf(AbortSignal);
        }
        expect(new Set(state.chartCalls.map((args) => args[2].fetchOptions.signal)).size).toBe(state.chartCalls.length);
    });

    it('marks old real history stale, leaves current history unflagged, and does not mark estimated fallback', async () => {
        const results = await fetchAllIndices('YTD');

        const oldIndex = results.find((item) => item.symbol === '^HSI')!;
        const currentIndex = results.find((item) => item.symbol === '^GSPC')!;
        const twFund = results.find((item) => item.symbol === '0P00000EBQ')!;

        expect(oldIndex.stale).toBe(true);
        expect(currentIndex).not.toHaveProperty('stale');
        expect(twFund.stale).toBe(true);

        state.emptyChartSymbol = '^HSI';
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
        const estimated = (await fetchAllIndices('YTD')).find((item) => item.symbol === '^HSI')!;
        expect(estimated.estimated).toBe(true);
        expect(estimated).not.toHaveProperty('stale');
    });

    it('merges only valid cached in-scope missing symbols in index order', () => {
        const fresh = [{ symbol: '^GSPC', price: 1 }];
        const cached = [
            null,
            { price: 2 },
            { symbol: 'OUT-OF-SCOPE', price: 3 },
            { symbol: '^HSI', price: 4 },
        ];

        expect(mergeCarriedForward(fresh, cached)).toEqual([
            { symbol: '^GSPC', price: 1 },
            { symbol: '^HSI', price: 4, stale: true },
        ]);
        expect(mergeCarriedForward(fresh, [])).toEqual(fresh);
    });

    it('carries a cached missing symbol through refresh and caches stale-only data', async () => {
        state.dropSymbol = '^HSI';
        state.emptyChartSymbol = '^HSI';
        state.redis.get.mockResolvedValue(JSON.stringify({
            success: true,
            data: [{ symbol: '^HSI', price: 321, history: [] }],
        }));
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));

        const res = makeRes();
        await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

        expect(res.statusCode).toBe(200);
        const hsi = res.body.data.find((item: any) => item.symbol === '^HSI');
        expect(hsi).toMatchObject({ symbol: '^HSI', price: 321, stale: true });
        expect(hsi.estimated).toBeUndefined();
        expect(state.redis.set).toHaveBeenCalledWith(
            expect.stringContaining('global_market_cache_yfinance_v1_YTD'),
            expect.stringContaining('"stale":true'),
            { ex: 3600 },
        );
    });
});
