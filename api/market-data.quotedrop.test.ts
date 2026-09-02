import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/redis.js', () => ({ redis: null }));

// Yahoo's quote endpoint dropped 0P00000EBQ (Janus Henderson Global Technology
// Leaders) on 2026-09-02 while chart history kept working; the fund vanished
// from the funds page. Simulate: batch quote returns every symbol EXCEPT the
// fund, chart returns history for everything.
const state = vi.hoisted(() => ({ droppedSymbol: '0P00000EBQ' }));

vi.mock('yahoo-finance2', () => ({
    default: class {
        async quote(symbols: string[]) {
            return symbols
                .filter((s) => s !== state.droppedSymbol)
                .map((symbol) => ({ symbol, regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1 }));
        }
        async chart(symbol: string) {
            if (symbol === state.droppedSymbol) {
                return { quotes: [
                    { date: new Date('2026-01-02'), close: 200 },
                    { date: new Date('2026-08-31'), close: 220 },
                    { date: new Date('2026-09-01'), close: 227.03 },
                ] };
            }
            return { quotes: [{ date: new Date('2026-01-02'), close: 90 }, { date: new Date('2026-09-01'), close: 100 }] };
        }
    },
}));

const { fetchAllIndices } = await import('./market-data');

describe('fund missing from Yahoo quote batch (2026-09-02)', () => {
    // This suite exercises the Yahoo Finance chart path: make the Yahoo TW
    // source fail so the fund falls back to the mocked chart above.
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
    });

    it('keeps the fund, built from chart history, instead of dropping it', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const results = await fetchAllIndices('YTD');
        const fund = results.find((r) => r.symbol === '0P00000EBQ');
        expect(fund).toBeDefined();
        expect(fund!.price).toBeCloseTo(227.03);
        expect(fund!.change).toBeCloseTo(7.03);
        expect(fund!.history.length).toBe(4); // 3 closes + live tail point
        expect(fund!.ytdChangePercent).toBeCloseTo(((227.03 - 200) / 200) * 100);
        expect(fund!.estimated).toBeUndefined();
        expect(fund!.open).toBeCloseTo(227.03);
    });

    it('still skips a symbol that has neither quote nor chart history', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        state.droppedSymbol = '^HSI';
        const YF = (await import('yahoo-finance2')).default as any;
        const orig = YF.prototype.chart;
        YF.prototype.chart = async (symbol: string) => (symbol === '^HSI' ? { quotes: [] } : orig(symbol));
        try {
            const results = await fetchAllIndices('YTD');
            expect(results.find((r) => r.symbol === '^HSI')).toBeUndefined();
            expect(results.length).toBeGreaterThan(0);
        } finally {
            YF.prototype.chart = orig;
            state.droppedSymbol = '0P00000EBQ';
        }
    });
});
