import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
    set: vi.fn(),
}));
const marketState = vi.hoisted(() => ({
    fetchAllIndices: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
    get redis() {
        return redisState;
    },
}));
vi.mock('../market-data.js', () => ({
    CACHE_KEY: 'global_market_cache_yfinance_v1',
    fetchAllIndices: marketState.fetchAllIndices,
}));

const { default: handler } = await import('./update-market-data');

function makeRes() {
    const res: any = {
        statusCode: 0,
        body: undefined,
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

async function call(authorization?: string) {
    const res = makeRes();
    await handler({ headers: authorization === undefined ? {} : { authorization } }, res);
    return res;
}

describe('update-market-data cron', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.CRON_SECRET = 'cron-secret';
        redisState.set.mockReset().mockResolvedValue('OK');
        marketState.fetchAllIndices.mockReset();
    });

    it.each([undefined, 'Bearer wrong-secret'])('rejects missing or wrong CRON_SECRET authorization (%s)', async authorization => {
        const res = await call(authorization);
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
        expect(marketState.fetchAllIndices).not.toHaveBeenCalled();
    });

    it('rejects requests when CRON_SECRET is not configured', async () => {
        delete process.env.CRON_SECRET;

        const res = await call('Bearer cron-secret');

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('does not overwrite cache when every upstream range returns zero rows', async () => {
        marketState.fetchAllIndices.mockResolvedValue([]);

        const res = await call('Bearer cron-secret');

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(Object.values(res.body.results).every((entry: any) => entry.success === false)).toBe(true);
        expect(redisState.set).not.toHaveBeenCalled();
    });

    it('reports partial success and caches only successful ranges', async () => {
        marketState.fetchAllIndices.mockImplementation(async (range: string) => {
            if (range === '3M') throw new Error('upstream failed');
            return [{ symbol: range }];
        });

        const res = await call('Bearer cron-secret');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.results['3M']).toMatchObject({ success: false });
        expect(res.body.results['1M']).toEqual({ success: true, count: 1 });
        expect(redisState.set).toHaveBeenCalledTimes(3);
        expect(redisState.set).not.toHaveBeenCalledWith(
            'global_market_cache_yfinance_v1_3M',
            expect.anything(),
            expect.anything(),
        );
    });
});
