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


// The JP10Y row is served from the Japanese Ministry of Finance CSV, not
// Yahoo, so a bare 503 stub leaves the payload one symbol short and the
// "never cache an incomplete payload" rule then (correctly) skips the cache
// write these tests assert. Answer MOF with a two-row CSV; everything else
// keeps the failure the test is actually about.
const JGB_CSV = [
    'header,,,,,,,,,,,,,,,',
    'date,1,2,3,4,5,6,7,8,9,10,15,20,25,30,40',
    'R8.9.1,1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,2.98,3.5,3.8,4.1,4.1,4.1',
    'R8.9.2,1.5,1.8,1.9,2.1,2.3,2.4,2.5,2.7,2.8,3.00,3.5,3.8,4.1,4.1,4.1',
].join('\n');

function stubFetchDownExceptJgb() {
    vi.stubGlobal('fetch', vi.fn((input: any) => String(input).includes('mof.go.jp')
        ? Promise.resolve(new Response(JGB_CSV, { status: 200 }))
        : Promise.resolve(new Response('down', { status: 503 }))));
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
        // Reversed in sweep 21 round 2. This asserted one FRESH signal per chart
        // call; the phase now shares ONE. Per-call budgets meant a twFundId
        // entry could spend 5s on Yahoo TW and then another 5s on its chart
        // fallback — sequentially, on top of the 5s quote — about 15s against a
        // function budget with no maxDuration set (Vercel default ~10s), and a
        // killed function never runs the handler's frozen-cache catch. These
        // calls are launched together by Promise.all, so one shared deadline
        // bounds the whole phase however the fallbacks chain.
        expect(new Set(state.chartCalls.map((args) => args[2].fetchOptions.signal)).size).toBe(1);
    });

    it('marks old real history stale, leaves current history unflagged, and badges the estimated fallback', async () => {
        const results = await fetchAllIndices('YTD');

        const oldIndex = results.find((item) => item.symbol === '^HSI')!;
        const currentIndex = results.find((item) => item.symbol === '^GSPC')!;
        const twFund = results.find((item) => item.symbol === '0P00000EBQ')!;

        expect(oldIndex.stale).toBe(true);
        expect(currentIndex).not.toHaveProperty('stale');
        expect(twFund.stale).toBe(true);

        state.emptyChartSymbol = '^HSI';
        stubFetchDownExceptJgb();
        const estimated = (await fetchAllIndices('YTD')).find((item) => item.symbol === '^HSI')!;
        expect(estimated.estimated).toBe(true);
        // Reversed in sweep 21 round 2. This asserted an estimated fallback is
        // NOT stale. But its ytdChange is synthesised from fiftyTwoWeekLow and
        // its sparkline is empty, and no client reads `estimated` — so the
        // invented figure rendered as fact with no cue at all. Badging is the
        // safe direction under the projector invariant.
        expect(estimated.stale).toBe(true);
    });

    // NIM (sweep 20 review): Yahoo dates weekly bars at the week's start, so
    // on a Monday morning the newest 5Y point is 7+ days old for every symbol.
    it('gives weekly (5Y) bars a 14-day budget before flagging stale', async () => {
        const YF = (await import('yahoo-finance2')).default as any;
        const orig = YF.prototype.chart;
        const day = 24 * 60 * 60 * 1000;
        YF.prototype.chart = async (symbol: string, ...rest: any[]) => {
            state.chartCalls.push([symbol, ...rest]);
            const age = symbol === '^GSPC' ? 9 * day : symbol === '^HSI' ? 20 * day : 0;
            return { quotes: [{ date: new Date(Date.now() - age - 7 * day), close: 90 }, { date: new Date(Date.now() - age), close: 100 }] };
        };
        stubFetchDownExceptJgb();
        try {
            const weekly = await fetchAllIndices('5Y');
            expect(weekly.find((i) => i.symbol === '^GSPC')).not.toHaveProperty('stale');
            expect(weekly.find((i) => i.symbol === '^HSI')!.stale).toBe(true);
            const daily = await fetchAllIndices('1M');
            expect(daily.find((i) => i.symbol === '^GSPC')!.stale).toBe(true);
        } finally {
            YF.prototype.chart = orig;
        }
    });

    it('merges only valid cached in-scope missing symbols in index order', () => {
        const fresh = [{ symbol: '^GSPC', price: 1 }];
        // Full-shape since sweep 21 round 2: a carried row is now also required
        // to be RENDERABLE, because `/` reaches MarketStatCard through
        // useDashboardData, which applies no usableQuotes gate.
        const hsi = {
            symbol: '^HSI', price: 4, changePercent: 1, ytdChangePercent: 1,
            low: 3, high: 5, history: [],
        };
        const cached = [
            null,
            { price: 2 },
            { symbol: 'OUT-OF-SCOPE', price: 3 },
            hsi,
        ];

        expect(mergeCarriedForward(fresh, cached)).toEqual([
            { symbol: '^GSPC', price: 1 },
            { ...hsi, stale: true },
        ]);
        expect(mergeCarriedForward(fresh, [])).toEqual(fresh);
    });

    it('carries a cached missing symbol through refresh and caches stale-only data', async () => {
        state.dropSymbol = '^HSI';
        state.emptyChartSymbol = '^HSI';
        state.redis.get.mockResolvedValue(JSON.stringify({
            success: true,
            // Full-shape since sweep 21 round 2 — carried rows must be renderable.
            data: [{
                symbol: '^HSI', price: 321, changePercent: 1, ytdChangePercent: 1,
                low: 320, high: 322, history: [],
            }],
        }));
        stubFetchDownExceptJgb();

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
