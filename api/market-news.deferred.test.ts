import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
    search: vi.fn(), keys: vi.fn(), callNim: vi.fn(),
}));
vi.mock('../lib/redis.js', () => ({ get redis() { return h.redis; } }));
vi.mock('yahoo-finance2', () => ({ default: class { search = h.search; } }));
vi.mock('../lib/nim.js', () => ({ getNimApiKeys: h.keys, callNim: h.callNim, NIM_TEXT_MODELS: ['m'] }));
const { default: handler } = await import('./market-news');

function response() {
    const res: any = { setHeader: vi.fn() };
    res.status = vi.fn((status: number) => { res.statusCode = status; return res; });
    res.json = vi.fn((body: unknown) => { res.body = body; return res; });
    return res;
}
async function call(url = '/api/market-news?refresh=true') {
    const res = response();
    await handler({ url, headers: { host: 'localhost' } } as any, res);
    return res;
}
const item = (id: string, publisher: string, date?: string) => ({ uuid: id, title: id, publisher, link: id, ...(date ? { providerPublishTime: new Date(date) } : {}) });

describe('market-news deferred fixes', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h.redis.get.mockReset().mockResolvedValue(null);
        h.redis.set.mockReset().mockResolvedValue('OK');
        h.redis.del.mockReset().mockResolvedValue(1);
        h.keys.mockReset().mockReturnValue([]);
        h.callNim.mockReset();
        h.search.mockReset().mockResolvedValue({ news: [item('fresh', 'Local', '2026-09-29T00:00:00Z')] });
    });

    it('sorts fresh items before premium status and puts undated items last', async () => {
        const nine = [
            item('old-reuters', 'Reuters', '2026-09-26T00:00:00Z'),
            item('new-local', 'Local', '2026-09-29T00:00:00Z'),
            item('mid', 'Local', '2026-09-28T00:00:00Z'),
            item('p3', 'Local', '2026-09-27T00:00:00Z'),
            item('p4', 'Local', '2026-09-26T12:00:00Z'),
            item('p5', 'Local', '2026-09-25T00:00:00Z'),
            item('p6', 'Local', '2026-09-24T00:00:00Z'),
            item('p7', 'Local', '2026-09-23T00:00:00Z'),
            item('undated', 'Bloomberg'),
        ];
        h.search.mockResolvedValue({ news: nine });
        const res = await call('/api/market-news');
        expect(res.body.data.map((x: any) => x.id)).toEqual(['new-local', 'mid', 'p3', 'p4', 'old-reuters', 'p5', 'p6', 'p7']);
    });

    it('releases an acquired throttle after an upstream failure', async () => {
        h.search.mockRejectedValue(new Error('upstream down'));
        const res = await call();
        expect(res.statusCode).toBe(500);
        expect(h.redis.del).toHaveBeenCalledWith('refresh_throttle_global_market_news_v1');
    });

    it('keeps the acquired throttle after a fresh success', async () => {
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(h.redis.del).not.toHaveBeenCalled();
        expect(h.redis.set.mock.calls.some(([key, , options]) => String(key).endsWith('_last_good') && options.ex === 7 * 24 * 3600)).toBe(true);
    });

    it('does not release a throttle this request did not acquire', async () => {
        h.redis.set.mockResolvedValue(null);
        const res = await call();
        expect(res.statusCode).toBe(503);
        expect(h.redis.del).not.toHaveBeenCalled();
    });

    it('uses last-good news when hot cache is absent during an outage', async () => {
        const payload = { success: true, data: [{ id: 'saved' }] };
        h.search.mockRejectedValue(new Error('upstream down'));
        h.redis.get.mockImplementation((key: string) => key.endsWith('_last_good') ? JSON.stringify(payload) : null);
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ data: payload.data, source: 'server_stale_cache', stale: true });
    });

    it('does not write last-good news for a partial fetch', async () => {
        h.search.mockReset().mockResolvedValueOnce({ news: [item('ok', 'Local')] }).mockRejectedValue(new Error('one failed'));
        await call();
        expect(h.redis.set.mock.calls.some(([key]) => String(key).endsWith('_last_good'))).toBe(false);
    });

    it('does not write last-good news when AI application is incomplete', async () => {
        h.keys.mockReturnValue(['key']);
        h.callNim.mockResolvedValue(JSON.stringify({ articles: [{ id: 1, summary: 'only one' }] }));
        h.search.mockResolvedValue({ news: [item('one', 'Local'), item('two', 'Local')] });
        await call();
        expect(h.redis.set.mock.calls.some(([key]) => String(key).endsWith('_last_good'))).toBe(false);
    });
    it('uses last-good news when the hot cache read throws', async () => {
        const payload = { success: true, data: [{ id: 'saved' }] };
        h.search.mockRejectedValue(new Error('upstream down'));
        h.redis.get.mockImplementation(async (key: string) => {
            if (key.endsWith('_last_good')) return JSON.stringify(payload);
            throw new Error('redis read failed');
        });
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ data: payload.data, source: 'server_stale_cache', stale: true });
    });

    it('treats a null publish time as missing, not 1970', async () => {
        h.search.mockResolvedValue({ news: [
            { uuid: 'local-null', title: 'a', publisher: 'Local', link: 'a', providerPublishTime: null },
            { uuid: 'reuters-undef', title: 'b', publisher: 'Reuters', link: 'b' },
            item('dated', 'Local', '2026-09-28T00:00:00Z'),
        ] });
        const res = await call('/api/market-news');
        expect(res.body.data.map((x: any) => x.id)).toEqual(['dated', 'reuters-undef', 'local-null']);
    });
});
