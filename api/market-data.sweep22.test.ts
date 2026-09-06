import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Sweep 22 — robustness of the quote() batch and the new Rates rows. */

const state = vi.hoisted(() => ({
    quoteResult: null as any,
    chartBySymbol: {} as Record<string, number[]>,
    chartRawBySymbol: {} as Record<string, any>,
    chartCalls: 0,
    redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../lib/redis.js', () => ({ get redis() { return state.redis; } }));

vi.mock('yahoo-finance2', () => ({
    default: class {
        async quote(...args: any[]) {
            if (state.quoteResult !== null) return state.quoteResult;
            return (args[0] as string[]).map((symbol) => ({
                symbol, regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1,
            }));
        }
        async chart(...args: any[]) {
            state.chartCalls++;
            if (state.chartRawBySymbol[args[0] as string] !== undefined) return state.chartRawBySymbol[args[0] as string];
            const closes = state.chartBySymbol[args[0] as string];
            if (closes) return { quotes: closes.map((close, i) => ({ date: new Date(Date.now() - (closes.length - 1 - i) * 86400000), close })) };
            return { quotes: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 },
                { date: new Date(), close: 100 },
            ] };
        }
    },
}));

const { fetchAllIndices, mergeCarriedForward } = await import('./market-data');

// Two header rows, then era-dated rows; the 10Y yield is the 10th value.
function jgbCsv(tenYear: number[]) {
    const rows = tenYear.map((y, i) => `R8.9.${i + 1},1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,${y},3.5,3.8,4.1,4.1,4.1`);
    return ['header,,,,,,,,,,,,,,,', 'date,1,2,3,4,5,6,7,8,9,10,15,20,25,30,40', ...rows].join('\n');
}

function stubFetch(csv: string) {
    vi.stubGlobal('fetch', vi.fn((input: any) => String(input).includes('mof.go.jp')
        ? Promise.resolve(new Response(csv, { status: 200 }))
        : Promise.resolve(new Response('down', { status: 503 }))));
}

describe('sweep 22 — quote batch shape', () => {
    beforeEach(() => {
        state.quoteResult = null;
        state.chartBySymbol = {};
        state.chartRawBySymbol = {};
        state.chartCalls = 0;
        state.redis.get.mockReset().mockResolvedValue(null);
        state.redis.set.mockReset().mockResolvedValue('OK');
        stubFetch(jgbCsv([2.98, 3.0]));
    });

    it('does not clamp a rate that moved more than 20% off its last close', async () => {
        // The 20% sanity cap exists for spurious equity prices. A yield near
        // zero legitimately moves that much in a day (0.05% -> 0.07% is +40%),
        // and clamping it desyncs the sparkline end point from the live price.
        state.chartBySymbol['^TNX'] = [0.04, 0.05];
        state.quoteResult = [{ symbol: '^TNX', regularMarketPrice: 0.07, regularMarketChange: 0.02, regularMarketChangePercent: 40 }];
        const data = await fetchAllIndices('1M');
        const tnx = data.find((i: any) => i.symbol === '^TNX')!;
        expect(tnx.price).toBe(0.07);
        expect(tnx.history[tnx.history.length - 1].value).toBe(0.07);
    });

    it('survives a null entry in the quote batch instead of taking every symbol down', async () => {
        state.quoteResult = [null, { symbol: '^GSPC', regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1 }];
        const data = await fetchAllIndices('1M');
        expect(data.find((i: any) => i.symbol === '^GSPC')!.price).toBe(100);
        expect(data.length).toBeGreaterThan(20);
    });

    it('survives a non-array quote result by building every symbol from its chart', async () => {
        state.quoteResult = { symbol: '^GSPC', regularMarketPrice: 100 };
        const data = await fetchAllIndices('1M');
        expect(data.length).toBeGreaterThan(20);
        expect(data.every((i: any) => Number.isFinite(i.price))).toBe(true);
    });

    it('rethrows a non-array quote result when the caller holds a frozen fallback', async () => {
        // Same contract as a thrown quote(): with a cached payload to serve,
        // failing fast into server_stale_cache beats spending the chart budget.
        state.quoteResult = { symbol: '^GSPC', regularMarketPrice: 100 };
        // On main this also rejected — from `.find` on an object, AFTER the
        // chart phase had run. Fast failover means the sentinel and no charts.
        await expect(fetchAllIndices('1M', true)).rejects.toThrow(/non-array/);
        expect(state.chartCalls).toBe(0);
    });

    it('survives a chart whose quotes field is not an array', async () => {
        // Yahoo's chart() is .catch()-isolated per symbol, but a RESOLVED
        // malformed body ({ quotes: {} }) reached `.filter` and threw out of
        // the results loop — one bad chart body took every symbol down.
        state.chartRawBySymbol['^HSI'] = { quotes: {} };
        const data = await fetchAllIndices('1M');
        expect(data.length).toBeGreaterThan(20);
        expect(data.find((i: any) => i.symbol === '^GSPC')!.price).toBe(100);
    });

    it('carries the first RENDERABLE cached row, not the first row for the symbol', () => {
        // The handler concatenates hourly + last_good rows; a malformed hourly
        // row must not mask a good last_good row behind it.
        const bad = { symbol: '^HSI', price: 1 };
        const good = {
            symbol: '^HSI', price: 4, changePercent: 1, ytdChangePercent: 1,
            low: 3, high: 5, history: [],
        };
        expect(mergeCarriedForward([], [bad, good])).toEqual([{ ...good, stale: true }]);
    });
});
