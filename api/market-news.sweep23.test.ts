import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    redis: { get: vi.fn(), set: vi.fn() },
    search: vi.fn(),
    callNim: vi.fn(),
    keys: vi.fn(),
}));
vi.mock('../lib/redis.js', () => ({ get redis() { return h.redis; } }));
vi.mock('yahoo-finance2', () => ({ default: class { search = h.search; } }));
vi.mock('../lib/nim.js', () => ({ getNimApiKeys: h.keys, callNim: h.callNim, NIM_TEXT_MODELS: ['m'] }));

const { default: handler } = await import('./market-news');

const article = { uuid: 'u1', title: 'Fed holds', publisher: 'Reuters', link: 'https://x', providerPublishTime: new Date('2026-09-28T00:00:00Z') };

async function call() {
    const res: any = { setHeader: vi.fn() };
    res.status = vi.fn((s: number) => { res.statusCode = s; return res; });
    res.json = vi.fn((b: unknown) => { res.body = b; return res; });
    await handler({ url: '/api/market-news?lang=zh-TW', headers: { host: 'localhost' } } as any, res);
    return res;
}

describe('market-news sweep 23', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h.redis.get.mockReset().mockResolvedValue(null);
        h.redis.set.mockReset().mockResolvedValue('OK');
        h.search.mockReset().mockResolvedValue({ news: [null, article] });
        h.keys.mockReset().mockReturnValue([]);
        h.callNim.mockReset();
    });

    it('keeps the valid articles when a search result contains a null entry', async () => {
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.body.data.map((a: any) => a.id)).toEqual(['u1']);
    });

    it('does not label or long-cache a 200 whose articles were unusable as translated', async () => {
        h.keys.mockReturnValue(['k']);
        h.callNim.mockResolvedValue('{}');
        const res = await call();
        expect(res.body.isAiTranslated).toBe(false);
        expect(h.redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { ex: 60 });
    });

    it('still labels a fully applied AI result as translated', async () => {
        h.keys.mockReturnValue(['k']);
        h.callNim.mockResolvedValue(JSON.stringify({ pulse: { overview: 'o', highlights: [] }, articles: [{ title: '聯儲局按兵不動', summary: 's', sentiment: 'NEUTRAL' }] }));
        const res = await call();
        expect(res.body.isAiTranslated).toBe(true);
        expect(res.body.data[0].title).toBe('聯儲局按兵不動');
        expect(h.redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { ex: 900 });
    });

    it('serves the fresh payload when the cache write fails', async () => {
        h.redis.set.mockRejectedValue(new Error('upstash timeout'));
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('market-news sweep 23 (grok findings)', () => {
    it('gives every Yahoo search its own abort deadline', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        h.redis.get.mockReset().mockResolvedValue(null);
        h.redis.set.mockReset().mockResolvedValue('OK');
        h.keys.mockReset().mockReturnValue([]);
        h.search.mockReset().mockResolvedValue({ news: [article] });
        await call();
        expect(h.search).toHaveBeenCalledTimes(4);
        for (const c of h.search.mock.calls) {
            expect(c[2]?.fetchOptions?.signal).toBeInstanceOf(AbortSignal);
        }
    });
});

describe('market-news sweep 23 (partial fetch)', () => {
    it('caches a fetch that lost some searches for 60s only', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h.redis.get.mockReset().mockResolvedValue(null);
        h.redis.set.mockReset().mockResolvedValue('OK');
        h.keys.mockReset().mockReturnValue([]);
        h.search.mockReset()
            .mockResolvedValueOnce({ news: [article] })
            .mockRejectedValue(new Error('429'));
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(h.redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { ex: 60 });
    });
});
