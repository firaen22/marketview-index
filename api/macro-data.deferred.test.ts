import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock('../lib/redis.js', () => ({ get redis() { return h.redis; } }));
const { default: handler } = await import('./macro-data');

function response() {
    const res: any = { setHeader: vi.fn() };
    res.status = vi.fn((status: number) => { res.statusCode = status; return res; });
    res.json = vi.fn((body: unknown) => { res.body = body; return res; });
    return res;
}

describe('macro-data deferred fixes', () => {
    beforeEach(() => {
        process.env.FRED_API_KEY = '';
        h.redis.get.mockReset().mockResolvedValue(null);
        h.redis.set.mockReset().mockResolvedValue('OK');
        h.redis.del.mockReset().mockResolvedValue(1);
    });

    it('releases an acquired throttle when FRED configuration fails', async () => {
        const res = response();
        await handler({ url: '/api/macro-data?refresh=true', headers: { host: 'localhost' } } as any, res);
        expect(res.statusCode).toBe(500);
        expect(h.redis.del).toHaveBeenCalledWith('refresh_throttle_global_macro_data_v3');
    });

    it('does not release a throttle this request did not acquire', async () => {
        h.redis.set.mockResolvedValue(null);
        const res = response();
        await handler({ url: '/api/macro-data?refresh=true', headers: { host: 'localhost' } } as any, res);
        expect(res.statusCode).toBe(503);
        expect(h.redis.del).not.toHaveBeenCalled();
    });

    it('uses last-good macro data when hot cache is absent and refresh fails', async () => {
        process.env.FRED_API_KEY = 'key';
        const payload = { success: true, data: [{ symbol: 'saved' }] };
        h.redis.get.mockImplementation((key: string) => key === 'global_macro_last_good_v3' ? JSON.stringify(payload) : null);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('FRED down')));
        const res = response();
        await handler({ url: '/api/macro-data?refresh=true', headers: { host: 'localhost' } } as any, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ data: payload.data, source: 'server_stale_cache', stale: true });
        vi.unstubAllGlobals();
    });
    it('uses last-good macro data when the hot cache read throws', async () => {
        process.env.FRED_API_KEY = 'key';
        const payload = { success: true, data: [{ symbol: 'saved' }] };
        h.redis.get.mockImplementation(async (key: string) => {
            if (key === 'global_macro_last_good_v3') return JSON.stringify(payload);
            throw new Error('redis read failed');
        });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('FRED down')));
        const res = response();
        await handler({ url: '/api/macro-data?refresh=true', headers: { host: 'localhost' } } as any, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ data: payload.data, source: 'server_stale_cache', stale: true });
        vi.unstubAllGlobals();
    });
});
