import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Sweep 22 — robustness of the quote() batch and the new Rates rows. */

const state = vi.hoisted(() => ({
    quoteResult: null as any,
    chartBySymbol: {} as Record<string, number[]>,
    chartEndOffsetDays: {} as Record<string, number>,
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
            if (closes) {
                const endOffset = state.chartEndOffsetDays[args[0] as string] ?? 0;
                return { quotes: closes.map((close, i) => ({
                    date: new Date(Date.now() - (endOffset + closes.length - 1 - i) * 86400000), close,
                })) };
            }
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
        state.chartEndOffsetDays = {};
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

    it('still catches an order-of-magnitude tick when the newest bar is a WEEK old (5Y)', async () => {
        // codex review: 5Y uses weekly bars, dated at the week's START, so the
        // newest bar is up to 7 days old by construction. A <24h corroboration
        // window meant the cap NEVER fired on 5Y and the 14-day weekly stale
        // threshold left it unbadged too — a 10x outlier as the headline price.
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.chartEndOffsetDays['^HSI'] = 5;
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 178000, regularMarketChange: 160200, regularMarketChangePercent: 900 }];
        const hsi = (await fetchAllIndices('5Y')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(17800);
        expect(hsi.stale).toBe(true);
    });

    it('catches a 1.5x tick against a week-old bar, which 100% would have missed', async () => {
        // codex round 2: at a 100% non-fresh threshold a 1.5x tick deviates
        // only 50%, so the cap missed it AND the 14-day weekly stale threshold
        // left it unbadged. 50% is above the worst weekly drawdown these
        // categories have ever recorded, so a real move never reaches it.
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.chartEndOffsetDays['^HSI'] = 5;
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 26700, regularMarketChange: 8900, regularMarketChangePercent: 50 }];
        const hsi = (await fetchAllIndices('5Y')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(17800);
        expect(hsi.stale).toBe(true);
    });

    it('catches an order-of-magnitude tick when the newest bar carries NO date', async () => {
        // codex review: the chart filter deliberately admits undated points, and
        // an undated newest bar left BOTH the cap and the stale flag off.
        state.chartRawBySymbol['^HSI'] = { quotes: [{ date: undefined, close: 17800 }] };
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 178000, regularMarketChange: 160200, regularMarketChangePercent: 900 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(17800);
    });

    it('does not throw when a chart point dates as an ISO STRING rather than a Date', async () => {
        // Every other reader in this block coerces with `new Date(pt.date)`;
        // the cap's recency check must too, or a provider shape change turns
        // one symbol into a TypeError that freezes the WHOLE payload.
        state.chartRawBySymbol['^HSI'] = { quotes: [
            { date: new Date(Date.now() - 86400000).toISOString(), close: 17700 },
            { date: new Date().toISOString(), close: 17800 },
        ] };
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 178000, regularMarketChange: 160200, regularMarketChangePercent: 900 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(17800);
    });

    it('does not treat a FUTURE-dated bar as today for the tight 20% threshold', async () => {
        // codex review: Math.abs() made a bar dated ahead of us read as recent,
        // so a real move could be clamped against a not-yet-valid close.
        state.chartRawBySymbol['^HSI'] = { quotes: [
            { date: new Date(Date.now() + 2 * 3600_000), close: 17800 },
        ] };
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 23140, regularMarketChange: 5340, regularMarketChangePercent: 30 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(23140);
    });

    it('honours MARKET_SANITY_CAP=off as an operator escape hatch', async () => {
        // A genuinely wild day: flip the var in the Vercel dashboard and
        // redeploy, no code change or review round. Read per call, so the
        // value is picked up by the next invocation.
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 178000, regularMarketChange: 160200, regularMarketChangePercent: 900 }];
        process.env.MARKET_SANITY_CAP = 'off';
        try {
            const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
            expect(hsi.price).toBe(178000);
            expect(hsi.stale).toBeUndefined();
        } finally {
            delete process.env.MARKET_SANITY_CAP;
        }
    });

    it('collapses an implausible equity quote (>=20% off last close) to the chart close, badged stale', async () => {
        // A bad tick (HSI 178,000 for 17,800) used to keep the outlier as the
        // headline price while only the sparkline end point was clamped — the
        // wrong number, unbadged, cached for an hour.
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 178000, regularMarketChange: 160200, regularMarketChangePercent: 900,
            regularMarketOpen: 178000, regularMarketDayHigh: 178100, regularMarketDayLow: 177900 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(17800);
        expect(hsi.high).toBe(17800);
        expect(hsi.low).toBe(17800);
        expect(hsi.changePercent).toBeCloseTo(100 / 177, 3);
        expect(hsi.stale).toBe(true);
        expect(hsi.history[hsi.history.length - 1].value).toBe(17800);
    });

    it('leaves a plausible equity quote (<20% off last close) untouched', async () => {
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 21000, regularMarketChange: 3200, regularMarketChangePercent: 18 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(21000);
        expect(hsi).not.toHaveProperty('stale');
    });

    it('does not cap categories where a 20% day is real (Volatility, Crypto, Commodity)', async () => {
        state.chartBySymbol['^VIX'] = [15, 16];
        state.chartBySymbol['BTC-USD'] = [50000, 52000];
        state.quoteResult = [
            { symbol: '^VIX', regularMarketPrice: 24, regularMarketChange: 8, regularMarketChangePercent: 50 },
            { symbol: 'BTC-USD', regularMarketPrice: 40000, regularMarketChange: -12000, regularMarketChangePercent: -23 },
        ];
        const data = await fetchAllIndices('1M');
        expect(data.find((i: any) => i.symbol === '^VIX')!.price).toBe(24);
        expect(data.find((i: any) => i.symbol === 'BTC-USD')!.price).toBe(40000);
        expect(data.find((i: any) => i.symbol === '^VIX')).not.toHaveProperty('stale');
    });

    it('does not cap categories where a 20% day is real (Volatility, Crypto, Commodity)', async () => {
        // VIX doubling, bitcoin dropping a quarter and crude spiking are all
        // things that actually happen; only an index or an FX major moving
        // 20% in a day is more likely a bad tick than a market.
        state.chartBySymbol['^VIX'] = [15, 16];
        state.chartBySymbol['BTC-USD'] = [50000, 52000];
        state.chartBySymbol['CL=F'] = [70, 71];
        state.quoteResult = [
            { symbol: '^VIX', regularMarketPrice: 24, regularMarketChange: 8, regularMarketChangePercent: 50 },
            { symbol: 'BTC-USD', regularMarketPrice: 40000, regularMarketChange: -12000, regularMarketChangePercent: -23 },
            { symbol: 'CL=F', regularMarketPrice: 90, regularMarketChange: 19, regularMarketChangePercent: 27 },
        ];
        const data = await fetchAllIndices('1M');
        expect(data.find((i: any) => i.symbol === '^VIX')!.price).toBe(24);
        expect(data.find((i: any) => i.symbol === 'BTC-USD')!.price).toBe(40000);
        expect(data.find((i: any) => i.symbol === 'CL=F')!.price).toBe(90);
        expect(data.find((i: any) => i.symbol === '^VIX')).not.toHaveProperty('stale');
    });

    it('keeps the live price when the chart is too old to corroborate it', async () => {
        // The cap compares the quote against TODAY'S bar. On a real crash the
        // live quote and today's bar move together, so the cap never fires.
        // With no fresh bar there is nothing to check against — a genuine
        // gap-down after a long holiday must not be rewritten to a week-old
        // close. The tile is badged stale by the age rule either way.
        state.chartBySymbol['^HSI'] = [17700, 17800];
        state.chartEndOffsetDays['^HSI'] = 5;
        state.quoteResult = [{ symbol: '^HSI', regularMarketPrice: 12000, regularMarketChange: -5800, regularMarketChangePercent: -32 }];
        const hsi = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^HSI')!;
        expect(hsi.price).toBe(12000);
    });

});
