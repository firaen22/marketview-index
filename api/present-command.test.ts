import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        expire: vi.fn(),
    } as any,
}));

const nimState = vi.hoisted(() => ({
    callNim: vi.fn(),
}));

vi.mock('../lib/redis.js', () => ({
    get redis() {
        return redisState.current;
    },
}));

vi.mock('../lib/nim.js', async importOriginal => {
    const actual = await importOriginal<typeof import('../lib/nim.js')>();
    return {
        ...actual,
        getNimApiKeys: () => ['nim-key'],
        callNim: nimState.callNim,
    };
});

const { default: handler } = await import('./present-command');

const catalog = [
    { symbol: '^HSI', name: '恒生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^GSPC', name: '標普500', nameEn: 'S&P 500', group: 'market' },
    { symbol: '^IXIC', name: '納斯達克', nameEn: 'Nasdaq Composite', group: 'market' },
    { symbol: '^DJI', name: '道瓊斯', nameEn: 'Dow Jones', group: 'market' },
    { symbol: '^FTSE', name: '富時100', nameEn: 'FTSE 100', group: 'market' },
    { symbol: '^N225', name: '日經225', nameEn: 'Nikkei 225', group: 'market' },
    { symbol: 'US10Y', name: '美國十年期債息', nameEn: 'US 10Y Yield', group: 'macro' },
] as const;

function makeReq(partial: any = {}) {
    return {
        method: 'GET',
        headers: {},
        query: {},
        body: undefined,
        socket: { remoteAddress: '127.0.0.1' },
        ...partial,
    };
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        headers: {} as Record<string, string>,
        body: undefined,
        setHeader: vi.fn((name: string, value: string) => {
            res.headers[name] = value;
        }),
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

async function call(req: any) {
    const res = makeRes();
    await handler(req, res);
    return res;
}

function authPost(body: any) {
    return makeReq({ method: 'POST', headers: { 'x-api-key': 'secret' }, body });
}

function lastStoredCommand() {
    return JSON.parse(redisState.current.set.mock.calls.at(-1)[1]);
}

describe('present-command API handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(5000);
        process.env.PRESENT_API_KEY = 'secret';
        redisState.current = {
            get: vi.fn(),
            set: vi.fn().mockResolvedValue('OK'),
            incr: vi.fn().mockResolvedValue(1),
            ttl: vi.fn().mockResolvedValue(60),
            expire: vi.fn().mockResolvedValue(1),
        };
        nimState.callNim.mockReset();
    });

    it('returns 503 when Redis is not configured', async () => {
        redisState.current = null;

        const res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: 'Storage not configured' });
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('GET returns the stored executable command or null for corrupt JSON', async () => {
        redisState.current.get.mockResolvedValue(JSON.stringify({
            v: 1,
            id: 'cmd-1',
            kind: 'clear',
            symbols: [],
            issuedAt: 5000,
        }));

        let res = await call(makeReq({ method: 'GET' }));

        expect(redisState.current.get).toHaveBeenCalledWith('present:cmd:v1');
        expect(res.statusCode).toBe(200);
        expect(res.body.command.kind).toBe('clear');
        expect(res.headers['Cache-Control']).toBe('no-store');

        redisState.current.get.mockResolvedValue('{bad');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, command: null, serverTime: expect.any(Number) });
    });

    it('rate-limits GET and does not add CORS headers', async () => {
        redisState.current.incr.mockResolvedValue(31);

        const res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: 'rate_limited' });
        expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('rejects empty and oversized text before parsing', async () => {
        let res = await call(authPost({ action: 'send', text: '   ', lang: 'en', catalog }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });

        res = await call(authPost({ action: 'send', text: 'x'.repeat(201), lang: 'en', catalog }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });
    });

    it('rejects missing, empty, or invalid catalogs', async () => {
        let res = await call(authPost({ action: 'send', text: 'show hsi', lang: 'en' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_catalog' });

        res = await call(authPost({ action: 'send', text: 'show hsi', lang: 'en', catalog: [] }));
        expect(res.statusCode).toBe(400);

        res = await call(authPost({
            action: 'send',
            text: 'show hsi',
            lang: 'en',
            catalog: [{ symbol: 'X'.repeat(25), name: 'Name', group: 'market' }],
        }));
        expect(res.statusCode).toBe(400);
    });

    it('stores deterministic send and clear commands with TTL', async () => {
        let res = await call(authPost({ action: 'send', text: 'show hsi', lang: 'en', catalog }));

        expect(res.statusCode).toBe(200);
        expect(res.body.command).toMatchObject({
            v: 1,
            kind: 'chart',
            symbols: ['^HSI'],
            issuedAt: 5000,
        });
        expect(typeof res.body.command.id).toBe('string');
        expect(res.body.command.id.length).toBeGreaterThan(0);
        expect(redisState.current.set).toHaveBeenCalledWith('present:cmd:v1', JSON.stringify(res.body.command), { ex: 120 });

        res = await call(authPost({ action: 'clear' }));

        expect(res.statusCode).toBe(200);
        expect(lastStoredCommand()).toMatchObject({
            v: 1,
            kind: 'clear',
            symbols: [],
            issuedAt: 5000,
        });
        expect(lastStoredCommand().id.length).toBeGreaterThan(0);
    });

    it('validates NIM fallback output and rejects unknown symbols, none, garbage, and macro charts', async () => {
        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ kind: 'chart', symbols: ['^FAKE'] }));
        let res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(422);
        expect(res.body).toEqual({ error: 'cannot_parse' });

        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ kind: 'none' }));
        res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(422);

        nimState.callNim.mockResolvedValueOnce('not json');
        res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(422);

        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ kind: 'chart', symbols: ['US10Y'] }));
        res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(422);
    });

    it('canonicalizes NIM compare dedupe, compare truncation, and macro quote', async () => {
        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ kind: 'compare', symbols: ['^HSI', '^HSI'] }));
        let res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(200);
        expect(res.body.command).toMatchObject({ kind: 'chart', symbols: ['^HSI'] });

        nimState.callNim.mockResolvedValueOnce(JSON.stringify({
            kind: 'compare',
            symbols: ['^HSI', '^GSPC', '^IXIC', '^DJI', '^FTSE', '^N225'],
        }));
        res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(200);
        expect(res.body.command).toMatchObject({ kind: 'compare', symbols: ['^HSI', '^GSPC', '^IXIC', '^DJI', '^FTSE'] });

        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ kind: 'quote', symbols: ['US10Y'] }));
        res = await call(authPost({ action: 'send', text: 'mystery', lang: 'en', catalog }));
        expect(res.statusCode).toBe(200);
        expect(res.body.command).toMatchObject({ kind: 'quote', symbols: ['US10Y'] });
    });

    it('requires auth, valid lang, and known action/method', async () => {
        let res = await call(makeReq({ method: 'POST', body: { action: 'clear' } }));
        expect(res.statusCode).toBe(401);

        res = await call(authPost({ action: 'send', text: 'show hsi', lang: 'fr', catalog }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid lang' });

        res = await call(authPost({ action: 'missing' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Unknown action' });

        res = await call(makeReq({ method: 'OPTIONS' }));
        expect(res.statusCode).toBe(405);
        expect(res.body).toEqual({ error: 'Method not allowed' });
    });
});
