import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../lib/redis.js', () => ({ get redis() { return redisState; } }));

const { default: handler } = await import('./macro-data');

const obs = (values: string[]) => ({ observations: values.map((value, i) => ({ date: `2026-0${(i % 9) + 1}-01`, value })) });
const SERIES: Record<string, any> = {
    CPIAUCSL: obs(Array(14).fill('100')), CPILFESL: obs(Array(14).fill('100')),
    PPIFIS: obs(Array(14).fill('100')), PPIFES: obs(Array(14).fill('100')),
    GDPC1: obs(['110', '105', '104', '103', '100', '99']), GDPNOW: obs(['2.5', '2.1']),
};

describe('macro-data sweep 23', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        process.env.FRED_API_KEY = 'test-key';
        redisState.get.mockReset().mockResolvedValue(null);
        redisState.set.mockReset().mockRejectedValue(new Error('upstash timeout'));
    });

    it('serves the fresh payload when the cache write fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const id = /series_id=([A-Z0-9]+)/.exec(String(url))?.[1] ?? '';
            return { ok: true, json: async () => SERIES[id] } as any;
        }));
        const res: any = { setHeader: vi.fn() };
        res.status = vi.fn((s: number) => { res.statusCode = s; return res; });
        res.json = vi.fn((b: unknown) => { res.body = b; return res; });
        await handler({ url: '/api/macro-data', headers: { host: 'localhost' } } as any, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(6);
    });
});
