import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
    get: vi.fn(),
    set: vi.fn(),
}));

vi.mock('../lib/redis.js', () => ({
    get redis() {
        return redisState;
    },
}));

const { default: handler } = await import('./macro-data');

function fredObservations(values: string[]) {
    return {
        observations: values.map((value, i) => ({ date: `2026-0${(i % 9) + 1}-01`, value })),
    };
}

function monthlySeries() {
    return fredObservations(Array.from({ length: 14 }, () => '100'));
}

function quarterlyGdp() {
    return fredObservations(['110', '105', '104', '103', '100', '99']);
}

function gdpNow() {
    return fredObservations(['2.5', '2.1']);
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

const ALL_SERIES: Record<string, any> = {
    CPIAUCSL: monthlySeries(),
    CPILFESL: monthlySeries(),
    PPIFIS: monthlySeries(),
    PPIFES: monthlySeries(),
    GDPC1: quarterlyGdp(),
    GDPNOW: gdpNow(),
};

describe('macro-data partial-result caching', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        process.env.FRED_API_KEY = 'test-key';
        redisState.get.mockReset().mockResolvedValue(null);
        redisState.set.mockReset().mockResolvedValue('OK');
    });

    it('caches the payload when every series succeeds', async () => {
        const res = await callWith(ALL_SERIES);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(6);
        expect(redisState.set).toHaveBeenCalledTimes(1);
    });

    it('serves a partial result live but does not cache it', async () => {
        const { GDPNOW: _omitted, ...withoutGdpNow } = ALL_SERIES;
        const res = await callWith(withoutGdpNow);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(5);
        expect(redisState.set).not.toHaveBeenCalled();
    });
});
