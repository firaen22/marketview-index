import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    emptyChartSymbol: null as string | null,
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
            if (args[0] === state.emptyChartSymbol) return { quotes: [] };
            return { quotes: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), close: 90 },
                { date: new Date(), close: 100 },
            ] };
        }
    },
}));

const { default: handler, fetchAllIndices } = await import('./market-data');

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

describe('sweep 21 — quote present but chart empty', () => {
    beforeEach(() => {
        state.emptyChartSymbol = null;
        state.redis.get.mockReset().mockResolvedValue(null);
        state.redis.set.mockReset().mockResolvedValue('OK');
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status: 503 }))));
    });

    it('does not blank a tile that has good cached history when only the chart fetch fails', async () => {
        state.emptyChartSymbol = '^HSI';
        state.redis.get.mockResolvedValue(JSON.stringify({
            success: true,
            // Full-shape since round 2 — carried rows must be renderable.
            data: [{
                symbol: '^HSI', price: 321, changePercent: 1, ytdChangePercent: 1,
                low: 320, high: 322, history: [{ value: 321, date: new Date().toISOString() }],
            }],
        }));

        const res = makeRes();
        await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

        const hsi = res.body.data.find((item: any) => item.symbol === '^HSI');
        // The projector must never show a frozen/blank tile with no banner.
        expect(hsi.history.length).toBeGreaterThan(0);
        expect(hsi.stale).toBe(true);
    });

    it('never renders a fund price outside its own high/low', async () => {
        // A fund quote carries a NAV that can be months old; the chart close
        // replaces the price, so the quote's OHLC must not survive beside it.
        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function (symbols: string[]) {
            return symbols.map((symbol) => ({
                symbol,
                regularMarketPrice: 114.6,
                regularMarketOpen: 114.6,
                regularMarketDayHigh: 114.6,
                regularMarketDayLow: 114.6,
            }));
        };
        try {
            const data = await fetchAllIndices('1M');
            const fund = data.find((i: any) => i.symbol === '0P00000B0I')!;
            expect(fund.price).toBe(100); // the chart's last close, not the quote NAV
            expect(fund.low).toBeLessThanOrEqual(fund.price);
            expect(fund.high).toBeGreaterThanOrEqual(fund.price);
        } finally {
            YF.prototype.quote = origQuote;
        }
    });

    it('drops a malformed chart date instead of freezing the whole payload', async () => {
        const YF: any = (await import('yahoo-finance2')).default;
        const orig = YF.prototype.chart;
        YF.prototype.chart = async function (symbol: string) {
            if (symbol === '^HSI') {
                return { quotes: [
                    { date: 'not-a-date', close: 100 },
                    { date: new Date(), close: 101 },
                ] };
            }
            return orig.call(this, symbol);
        };
        try {
            // Before the guard this threw RangeError out of fetchAllIndices and
            // took every other symbol down with it.
            const data = await fetchAllIndices('1M');
            expect(data.length).toBeGreaterThan(1);
            const hsi = data.find((i: any) => i.symbol === '^HSI')!;
            expect(hsi.history.every((h: any) => !Number.isNaN(Date.parse(h.date)))).toBe(true);
        } finally {
            YF.prototype.chart = orig;
        }
    });

    it('keeps an estimated symbol when no cached entry exists to replace it', async () => {
        // Guards the sweep-20 regression in reverse: treating estimated items as
        // absent must never make a symbol disappear from the payload entirely.
        state.emptyChartSymbol = '^HSI';
        state.redis.get.mockResolvedValue(JSON.stringify({
            success: true,
            data: [{ symbol: '^GSPC', price: 1, history: [{ value: 1, date: new Date().toISOString() }] }],
        }));

        const res = makeRes();
        await handler(makeReq('http://localhost/api/market-data?refresh=true'), res);

        const hsi = res.body.data.find((item: any) => item.symbol === '^HSI');
        expect(hsi).toBeDefined();
        expect(hsi.estimated).toBe(true);
    });

    it('degrades to chart-only instead of blanking when the batch quote fails', async () => {
        const YF: any = (await import('yahoo-finance2')).default;
        const origQuote = YF.prototype.quote;
        YF.prototype.quote = async function () { throw new Error('The operation was aborted due to timeout'); };
        try {
            // Cold cache + failed quote used to answer with no data at all.
            const data = await fetchAllIndices('1M');
            expect(data.length).toBeGreaterThan(20);
            const gspc = data.find((i: any) => i.symbol === '^GSPC')!;
            expect(gspc.price).toBe(100); // built from the chart's last close
            expect(gspc.history.length).toBeGreaterThan(0);
        } finally {
            YF.prototype.quote = origQuote;
        }
    });

    it('badges an estimated fund as stale, since its quote NAV cannot be validated', async () => {
        state.emptyChartSymbol = '0P00000B0I';
        const data = await fetchAllIndices('1M');
        const fund = data.find((i: any) => i.symbol === '0P00000B0I')!;
        expect(fund.estimated).toBe(true);
        expect(fund.stale).toBe(true);
        // An index keeps its live quote price and must NOT be badged.
        const gspc = data.find((i: any) => i.symbol === '^GSPC')!;
        expect(gspc.stale).toBeUndefined();
    });
});
