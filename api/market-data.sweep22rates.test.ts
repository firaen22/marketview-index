import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Sweep 22 — the new Rates rows. Own file: fetchJgbSeries memoises the
 *  series at module level, so it needs a fresh module instance. */

const state = vi.hoisted(() => ({
    quoteResult: null as any,
    chartBySymbol: {} as Record<string, number[]>,
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
            const closes = state.chartBySymbol[args[0] as string];
            if (closes) return { quotes: closes.map((close, i) => ({ date: new Date(Date.now() - (closes.length - 1 - i) * 86400000), close })) };
            return { quotes: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 },
                { date: new Date(), close: 100 },
            ] };
        }
    },
}));

const { fetchAllIndices, parseJgbCsv } = await import('./market-data');

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

describe('sweep 22 — a yield can be zero or negative', () => {
    beforeEach(() => {
        state.quoteResult = null;
        state.chartBySymbol = {};
        state.redis.get.mockReset().mockResolvedValue(null);
        state.redis.set.mockReset().mockResolvedValue('OK');
    });

    it('keeps the JGB tile when its yields are at or below zero', async () => {
        // Japan 10Y sat below zero from 2016 to 2020; a price-style `close > 0`
        // filter would drop those bars, and with every bar dropped the whole
        // tile — no tile, so no Delayed badge either.
        stubFetch(jgbCsv([0.05, 0, -0.1]));
        const data = await fetchAllIndices('1M');
        const jp = data.find((i: any) => i.symbol === 'JP10Y')!;
        expect(jp).toBeDefined();
        expect(jp.price).toBe(-0.1);
        expect(jp.history.length).toBe(4); // 3 bars + the live end point
        expect(Number.isFinite(jp.ytdChangePercent)).toBe(true);
        expect(Number.isFinite(jp.changePercent)).toBe(true);
        expect(jp.history.every((h: any) => Number.isFinite(h.value))).toBe(true);
    });

    it('skips a BLANK 10Y cell but keeps a genuine 0 print', () => {
        // Number('') is 0, so the old `close === 0` skip could not tell a blank
        // MOF cell from a real zero yield; the parser now tests the raw text.
        // (parseJgbCsv directly: fetchJgbSeries memoises the first CSV per module.)
        const rows = [
            'R8.9.1,1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,0.05,3.5,3.8,4.1,4.1,4.1',
            'R8.9.2,1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,,3.5,3.8,4.1,4.1,4.1',
            'R8.9.3,1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,-,3.5,3.8,4.1,4.1,4.1',
            'R8.9.4,1.5,1.8,1.9,2.1,2.2,2.4,2.5,2.7,2.8,0,3.5,3.8,4.1,4.1,4.1',
        ];
        const csv = ['header,,,,,,,,,,,,,,,', 'date,1,2,3,4,5,6,7,8,9,10,15,20,25,30,40', ...rows].join('\n');
        expect(parseJgbCsv(csv, 10).map((p) => p.close)).toEqual([0.05, 0]);
    });

    it('keeps a NEGATIVE live yield instead of treating it as priceless', async () => {
        // `priceless = !(price > 0)` was the fund/equity rule; for a rate it
        // silently replaced a valid live -0.1% with the last chart close.
        state.quoteResult = [{ symbol: '^TNX', regularMarketPrice: -0.1, regularMarketChange: 0.05, regularMarketChangePercent: -33 }];
        state.chartBySymbol = { '^TNX': [-0.2, -0.15] };
        stubFetch(jgbCsv([2.98, 3.0]));
        const tnx = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^TNX')!;
        expect(tnx.price).toBe(-0.1);
        expect(tnx.history[tnx.history.length - 1].value).toBe(-0.1);
    });

    it('falls a rate with a NULL live price back to the last chart close, not 0', async () => {
        // Sweep 20 saw this quote shape in prod. `price` is coalesced with
        // `|| 0` before the priceless check, and 0 is finite — so the raw
        // field has to be the one tested or the tile prints a live 0% yield.
        state.quoteResult = [{ symbol: '^TNX', regularMarketPrice: null, regularMarketChange: null, regularMarketChangePercent: null }];
        state.chartBySymbol = { '^TNX': [4.1, 4.2] };
        stubFetch(jgbCsv([2.98, 3.0]));
        const tnx = (await fetchAllIndices('1M')).find((i: any) => i.symbol === '^TNX')!;
        expect(tnx.price).toBe(4.2);
        expect(tnx.history[tnx.history.length - 1].value).toBe(4.2);
        expect(tnx.ytdChangePercent).not.toBe(-100);
    });
});
