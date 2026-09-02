import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/redis.js', () => ({ redis: null }));

// Yahoo Finance's quote endpoint dropped 0P00000EBQ and its chart series froze
// on 2026-07-17; the fund now sources its NAV from Yahoo Taiwan, with the
// Yahoo Finance chart as fallback.
const yf = vi.hoisted(() => ({ chartCalls: [] as string[] }));

vi.mock('yahoo-finance2', () => ({
    default: class {
        async quote(symbols: string[]) {
            return symbols
                .filter((s) => s !== '0P00000EBQ')
                .map((symbol) => ({ symbol, regularMarketPrice: 100, regularMarketChange: 1, regularMarketChangePercent: 1 }));
        }
        async chart(symbol: string) {
            yf.chartCalls.push(symbol);
            if (symbol === '0P00000EBQ') {
                return { quotes: [{ date: new Date('2026-01-02'), close: 280.59 }, { date: new Date('2026-07-17'), close: 332.22 }] };
            }
            return { quotes: [{ date: new Date('2026-01-02'), close: 90 }, { date: new Date('2026-09-01'), close: 100 }] };
        }
    },
}));

const { fetchAllIndices, fetchYahooTwFundHistory } = await import('./market-data');

function stubTw(handler: (url: string) => Promise<Response> | Response) {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => handler(String(input))));
}

afterEach(() => {
    vi.unstubAllGlobals();
    yf.chartCalls.length = 0;
});

describe('Janus Henderson fund sourced from Yahoo Taiwan', () => {
    it('uses the TW NAV series and the fund lands in the payload with a current price', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stubTw((url) => {
            expect(url).toContain('FundServices.fundsPriceHistory;fundId=F0GBR04E8V%3AFO;timeslot=');
            return Response.json({
                closePrices: ['280.59', '343.91', '339.20'],
                dates: ['2026-01-02', '2026-08-31', '2026-09-01'],
            });
        });
        const results = await fetchAllIndices('YTD');
        const fund = results.find((r) => r.symbol === '0P00000EBQ')!;
        expect(fund).toBeDefined();
        expect(fund.price).toBeCloseTo(339.2);
        expect(fund.change).toBeCloseTo(339.2 - 343.91);
        expect(fund.history.map((h) => h.value)).toEqual([280.59, 343.91, 339.2, 339.2]);
        expect(fund.history[2].date).toBe('2026-09-01T00:00:00.000Z');
        expect(fund.ytdChangePercent).toBeCloseTo(((339.2 - 280.59) / 280.59) * 100);
        expect(yf.chartCalls).not.toContain('0P00000EBQ');
    });

    it('falls back to the Yahoo Finance chart when TW fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stubTw(() => new Response('upstream down', { status: 503 }));
        const results = await fetchAllIndices('YTD');
        const fund = results.find((r) => r.symbol === '0P00000EBQ')!;
        expect(fund.price).toBeCloseTo(332.22);
        expect(yf.chartCalls).toContain('0P00000EBQ');
    });

    it('falls back when TW returns a malformed or empty body', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stubTw(() => Response.json({ closePrices: 'nope' }));
        const results = await fetchAllIndices('YTD');
        expect(results.find((r) => r.symbol === '0P00000EBQ')!.price).toBeCloseTo(332.22);
    });
});

describe('fetchYahooTwFundHistory', () => {
    it('drops non-numeric, non-positive and undated points and thins 5Y to weekly', async () => {
        const dates = Array.from({ length: 12 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
        const closes = dates.map((_, i) => String(100 + i));
        closes[3] = 'n/a';
        closes[5] = '0';
        stubTw(() => Response.json({ closePrices: closes, dates }));
        const daily = await fetchYahooTwFundHistory('X', '2026-01-01', '2026-01-31', '1d');
        expect(daily.map((p) => p.close)).toEqual([100, 101, 102, 104, 106, 107, 108, 109, 110, 111]);
        stubTw(() => Response.json({ closePrices: closes, dates }));
        const weekly = await fetchYahooTwFundHistory('X', '2021-01-01', '2026-01-31', '1wk');
        expect(weekly.map((p) => p.close)).toEqual([100, 107, 111]);
    });

    it('returns [] on timeout/network error instead of throwing', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stubTw(() => Promise.reject(new Error('timeout')));
        await expect(fetchYahooTwFundHistory('X', '2026-01-01', '2026-01-31', '1d')).resolves.toEqual([]);
    });
});
