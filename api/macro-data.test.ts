import { beforeEach, describe, expect, it, vi } from 'vitest';

// Redis disabled: the handler then always fetches live from FRED.
vi.mock('../lib/redis.js', () => ({ redis: null }));

const { default: handler } = await import('./macro-data');

function fredObservations(values: string[]) {
    return {
        observations: values.map((value, i) => ({ date: `2026-0${(i % 9) + 1}-01`, value })),
    };
}

// Enough monthly points (>=13) with a fixed current/prev-month/prev-year shape.
function monthlySeries(current: string, prevMonth: string, prevYear: string) {
    const values = Array.from({ length: 14 }, () => '100');
    values[0] = current;
    values[1] = prevMonth;
    values[12] = prevYear;
    return fredObservations(values);
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        body: undefined,
        setHeader: vi.fn(),
        status: vi.fn((status: number) => {
            res.statusCode = status;
            return res;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            return res;
        }),
    };
    return res;
}

async function callWith(bySeries: Record<string, any>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const seriesId = /series_id=([A-Z0-9]+)/.exec(String(url))?.[1] ?? '';
        const payload = bySeries[seriesId];
        if (!payload) return { ok: false, text: async () => 'not found' } as any;
        return { ok: true, json: async () => payload } as any;
    }));
    const res = makeRes();
    await handler({ url: '/api/macro-data', headers: { host: 'localhost' } } as any, res);
    return res;
}

describe('macro-data zero-baseline guards', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        process.env.FRED_API_KEY = 'test-key';
    });

    it('drops GDP when a zero baseline would make change percent Infinity', async () => {
        const res = await callWith({
            GDPC1: fredObservations(['100', '0', '99', '98', '0', '96']),
        });

        expect(res.statusCode).toBe(200);
        // Zero prev-quarter AND prev-year baselines: the row is dropped, same
        // contract as a missing (".") observation — never Infinity/null JSON.
        expect(res.body.data.some((row: any) => row.symbol === 'GDPC1')).toBe(false);
    });

    it('omits momChangePercent when the previous month is zero but keeps the series', async () => {
        const res = await callWith({
            CPIAUCSL: monthlySeries('101', '0', '100'),
        });

        expect(res.statusCode).toBe(200);
        const cpi = res.body.data.find((row: any) => row.symbol === 'CPIAUCSL');
        expect(cpi).toBeDefined();
        expect(cpi.momChangePercent).toBeUndefined();
        expect(cpi.changePercent).toBeCloseTo(1);
    });
});
