import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assistCacheKey } from '../lib/presentAssist';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        expire: vi.fn(),
        rpush: vi.fn(),
        lpop: vi.fn(),
    } as any,
}));

const nimState = vi.hoisted(() => ({
    callNim: vi.fn(),
    callNimHedged: vi.fn(),
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
        callNimHedged: nimState.callNimHedged,
    };
});

const {
    default: handler,
    presentAssistImageCacheKey,
    validatePresentAssistDeckKey,
    validatePresentAssistImageBase64,
    validatePresentAssistSlideId,
} = await import('./present-command');

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
            rpush: vi.fn().mockResolvedValue(1),
            lpop: vi.fn().mockResolvedValue(null),
        };
        nimState.callNim.mockReset();
        nimState.callNimHedged.mockReset();
    });

    it('returns 503 when Redis is not configured', async () => {
        redisState.current = null;

        const res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: 'Storage not configured' });
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('GET returns the stored executable command or null for corrupt JSON', async () => {
        redisState.current.get.mockImplementation(async (key: string) => key === 'present:cmd:v1' ? JSON.stringify({
            v: 1,
            id: 'cmd-1',
            kind: 'clear',
            symbols: [],
            issuedAt: 5000,
        }) : null);

        let res = await call(makeReq({ method: 'GET' }));

        expect(redisState.current.get).toHaveBeenCalledWith('present:cmd:v1');
        expect(res.statusCode).toBe(200);
        expect(res.body.command.kind).toBe('clear');
        expect(res.body.projector).toBeNull();
        expect(res.headers['Cache-Control']).toBe('no-store');

        redisState.current.get.mockImplementation(async (key: string) => key === 'present:cmd:v1' ? '{bad' : null);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, command: null, serverTime: expect.any(Number), projector: null, pageCommands: [] });
    });

    it('rate-limits GET and does not add CORS headers', async () => {
        redisState.current.incr.mockResolvedValue(91);

        const res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: 'rate_limited' });
        expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('GET stores valid projector state and includes it in the response', async () => {
        redisState.current.get.mockResolvedValue(null);

        const res = await call(makeReq({
            method: 'GET',
            query: { st: '1', mode: 'pdf', page: '2', v: '0' },
        }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.set).toHaveBeenCalledWith(
            'present:pstate:v1',
            JSON.stringify({ mode: 'pdf', page: 2, v: 0, at: 5000 }),
            { ex: 15 },
        );
        expect(res.body).toEqual({
            success: true,
            command: null,
            serverTime: 5000,
            projector: { mode: 'pdf', page: 2, v: 0, at: 5000 },
            pageCommands: [],
        });
    });

    it('GET ignores invalid projector params and still returns command with projector null', async () => {
        const cases = [
            { st: '1', mode: 'pdf', page: '0', v: '1' },
            { st: '1', mode: 'pdf', page: 'NaN', v: '1' },
            { st: '1', mode: 'evil', page: '1', v: '1' },
            { st: '1', mode: 'pdf', page: '1.5', v: '1' },
        ];

        for (const query of cases) {
            redisState.current.set.mockClear();
            redisState.current.get.mockImplementation(async (key: string) => key === 'present:cmd:v1' ? JSON.stringify({
                v: 1,
                id: 'cmd-1',
                kind: 'clear',
                symbols: [],
                issuedAt: 5000,
            }) : null);

            const res = await call(makeReq({ method: 'GET', query }));

            expect(res.statusCode).toBe(200);
            expect(redisState.current.set).not.toHaveBeenCalledWith('present:pstate:v1', expect.anything(), expect.anything());
            expect(res.body.command.kind).toBe('clear');
            expect(res.body.projector).toBeNull();
        }
    });

    it('GET returns projector null for corrupt or invalid stored projector state', async () => {
        redisState.current.get.mockImplementation(async (key: string) => {
            if (key === 'present:pstate:v1') return '{bad';
            return null;
        });

        let res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toBeNull();

        redisState.current.get.mockImplementation(async (key: string) => {
            if (key === 'present:pstate:v1') return JSON.stringify({ mode: 'pdf', page: 0, v: 1, at: 5000 });
            return null;
        });

        res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toBeNull();
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

    it('enqueues page commands with a validated direction and rejects invalid ones', async () => {
        let res = await call(authPost({ action: 'page', direction: 'next' }));
        expect(res.statusCode).toBe(200);
        // Page commands are RELATIVE and go to the queue, never the single
        // last-writer-wins command slot: rapid taps must all survive.
        expect(redisState.current.set).not.toHaveBeenCalledWith('present:cmd:v1', expect.anything(), expect.anything());
        const enqueued = JSON.parse(redisState.current.rpush.mock.calls.at(-1)[1]);
        expect(redisState.current.rpush.mock.calls.at(-1)[0]).toBe('present:pagecmd:v1');
        expect(enqueued).toMatchObject({
            v: 1,
            kind: 'page',
            symbols: [],
            direction: 'next',
            issuedAt: 5000,
        });
        expect(enqueued.id.length).toBeGreaterThan(0);
        expect(redisState.current.expire).toHaveBeenCalledWith('present:pagecmd:v1', 120);

        res = await call(authPost({ action: 'page', direction: 'prev' }));
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(redisState.current.rpush.mock.calls.at(-1)[1])).toMatchObject({ kind: 'page', direction: 'prev' });

        res = await call(authPost({ action: 'page', direction: 'sideways' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_direction' });

        res = await call(authPost({ action: 'page' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_direction' });
    });

    it('drains queued page commands only on the projector poll and skips malformed entries', async () => {
        redisState.current.get.mockResolvedValue(null);
        const pageCmd = (id: string) => JSON.stringify({ v: 1, id, kind: 'page', symbols: [], direction: 'next', issuedAt: 5000 });
        redisState.current.lpop.mockResolvedValue([
            pageCmd('p1'),
            '{bad json',
            JSON.stringify({ v: 1, id: 'not-page', kind: 'clear', symbols: [], issuedAt: 5000 }),
            pageCmd('p2'),
        ]);

        const res = await call(makeReq({ method: 'GET', query: { st: '1', mode: 'pdf', page: '2', v: '0' } }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.lpop).toHaveBeenCalledWith('present:pagecmd:v1', 20);
        expect(res.body.pageCommands.map((c: any) => c.id)).toEqual(['p1', 'p2']);
    });

    it('does not drain the page queue for non-projector polls', async () => {
        redisState.current.get.mockResolvedValue(null);

        const res = await call(makeReq({ method: 'GET' }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.lpop).not.toHaveBeenCalled();
        expect(res.body.pageCommands).toEqual([]);
    });

    it('does not drain the page queue for st=1 polls without a valid projector report', async () => {
        redisState.current.get.mockResolvedValue(null);

        // GET is unauthenticated by design: a bare or malformed st=1 probe
        // must not be able to consume page turns queued for the projector.
        for (const query of [{ st: '1' }, { st: '1', mode: 'evil', page: '1', v: '0' }, { st: '1', mode: 'pdf', page: '0', v: '0' }]) {
            const res = await call(makeReq({ method: 'GET', query }));
            expect(res.statusCode).toBe(200);
            expect(res.body.pageCommands).toEqual([]);
        }
        expect(redisState.current.lpop).not.toHaveBeenCalled();
    });

    it('returns pageCommands [] when the drain itself fails', async () => {
        redisState.current.get.mockResolvedValue(null);
        redisState.current.lpop.mockRejectedValue(new Error('redis down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await call(makeReq({ method: 'GET', query: { st: '1', mode: 'pdf', page: '1', v: '0' } }));

        expect(res.statusCode).toBe(200);
        expect(res.body.pageCommands).toEqual([]);
    });

    it('requires auth for page commands like every other action', async () => {
        const res = await call(makeReq({ method: 'POST', body: { action: 'page', direction: 'next' } }));
        expect(res.statusCode).toBe(401);
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

    it('assist requires auth, valid text length, and valid lang', async () => {
        let res = await call(makeReq({ method: 'POST', body: { action: 'assist', text: 'x'.repeat(40), lang: 'en' } }));
        expect(res.statusCode).toBe(401);

        res = await call(authPost({ action: 'assist', text: 'x'.repeat(39), lang: 'en' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });

        res = await call(authPost({ action: 'assist', text: 'x'.repeat(6001), lang: 'en' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });

        // Whitespace padding must not smuggle effectively-empty text past the
        // minimum: length is validated on the NORMALIZED text.
        res = await call(authPost({ action: 'assist', text: `short${' '.repeat(60)}text`, lang: 'en' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });

        res = await call(authPost({ action: 'assist', text: 'x'.repeat(40), lang: 'fr' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid lang' });
    });

    it('assist returns valid cached results and skips NIM', async () => {
        const text = 'This slide explains revenue growth, margin expansion, and cost discipline for the team.';
        redisState.current.get.mockImplementation(async (key: string) => key === assistCacheKey(text, 'en')
            ? JSON.stringify({ points: ['  Say revenue improved simply. '], questions: [{ q: ' Why? ', a: ' Better margin. ' }] })
            : null);

        const res = await call(authPost({ action: 'assist', text, lang: 'en' }));

        expect(res.statusCode).toBe(200);
        expect(nimState.callNim).not.toHaveBeenCalled();
        expect(res.body.assist).toEqual({
            points: ['Say revenue improved simply.'],
            questions: [{ q: 'Why?', a: 'Better margin.' }],
        });
    });

    it('assist treats corrupt cache as miss and stores only valid canonical results', async () => {
        const text = 'This slide explains revenue growth, margin expansion, and cost discipline for the team.';
        redisState.current.get.mockImplementation(async (key: string) => key === assistCacheKey(text, 'en') ? '{bad' : null);
        nimState.callNim.mockResolvedValueOnce(JSON.stringify({
            points: ['  First  ', 'Second', 'Third', 'Fourth'],
            questions: [{ q: ' Q ', a: ' A ' }],
            extra: true,
        }));

        const res = await call(authPost({ action: 'assist', text, lang: 'en' }));

        expect(res.statusCode).toBe(200);
        expect(res.body.assist).toEqual({
            points: ['First', 'Second', 'Third'],
            questions: [{ q: 'Q', a: 'A' }],
        });
        expect(redisState.current.set).toHaveBeenCalledWith(
            assistCacheKey(text, 'en'),
            JSON.stringify(res.body.assist),
            { ex: 2592000 },
        );
    });

    it('assist returns 422 and does not cache invalid NIM output', async () => {
        const text = 'This slide explains revenue growth, margin expansion, and cost discipline for the team.';
        redisState.current.get.mockResolvedValue(null);
        nimState.callNim.mockResolvedValueOnce(JSON.stringify({ points: [], questions: [] }));

        const res = await call(authPost({ action: 'assist', text, lang: 'en' }));

        expect(res.statusCode).toBe(422);
        expect(res.body).toEqual({ error: 'cannot_generate' });
        expect(redisState.current.set).not.toHaveBeenCalledWith(assistCacheKey(text, 'en'), expect.anything(), expect.anything());

        nimState.callNim.mockResolvedValueOnce('not json');
        const res2 = await call(authPost({ action: 'assist', text, lang: 'en' }));

        expect(res2.statusCode).toBe(422);
        expect(redisState.current.set).not.toHaveBeenCalledWith(assistCacheKey(text, 'en'), expect.anything(), expect.anything());
    });

    it('assist accepts raw 40 and 6000 char text', async () => {
        redisState.current.get.mockResolvedValue(null);
        nimState.callNim.mockResolvedValue(JSON.stringify({ points: ['point'], questions: [] }));

        let res = await call(authPost({ action: 'assist', text: 'x'.repeat(40), lang: 'en' }));
        expect(res.statusCode).toBe(200);

        res = await call(authPost({ action: 'assist', text: 'x'.repeat(6000), lang: 'en' }));
        expect(res.statusCode).toBe(200);
    });

    it('validates present assist slide ids by the strict table', () => {
        expect(validatePresentAssistSlideId('1#1')).toBe('1#1');
        expect(validatePresentAssistSlideId('1784119272589#10')).toBe('1784119272589#10');
        expect(validatePresentAssistSlideId('1#')).toBeNull();
        expect(validatePresentAssistSlideId('#1')).toBeNull();
        expect(validatePresentAssistSlideId('a#1')).toBeNull();
        expect(validatePresentAssistSlideId('1#1#1')).toBeNull();
        expect(validatePresentAssistSlideId('')).toBeNull();
        expect(validatePresentAssistSlideId('1#00000000')).toBeNull();
    });

    it('validates present assist deck keys by the strict table', () => {
        expect(validatePresentAssistDeckKey('')).toBeNull();
        expect(validatePresentAssistDeckKey('x')).toBe('x');
        expect(validatePresentAssistDeckKey('x'.repeat(2048))).toBe('x'.repeat(2048));
        expect(validatePresentAssistDeckKey('x'.repeat(2049))).toBeNull();
        expect(validatePresentAssistDeckKey(1)).toBeNull();
    });

    it('validates present assist image base64 by the strict table', () => {
        expect(validatePresentAssistImageBase64('A'.repeat(99))).toBeNull();
        expect(validatePresentAssistImageBase64('A'.repeat(100))).toBe('A'.repeat(100));
        expect(validatePresentAssistImageBase64('A'.repeat(3_000_000))).toBe('A'.repeat(3_000_000));
        expect(validatePresentAssistImageBase64('A'.repeat(3_000_001))).toBeNull();
        expect(validatePresentAssistImageBase64('A'.repeat(101))).toBeNull();
        expect(validatePresentAssistImageBase64(`${'A'.repeat(99)}!`)).toBeNull();
        expect(validatePresentAssistImageBase64(`${'A'.repeat(50)}=${'A'.repeat(49)}`)).toBeNull();
    });

    it('dispatches assist text and image payloads in the specified order', async () => {
        redisState.current.get.mockResolvedValue(null);
        nimState.callNim.mockResolvedValue(JSON.stringify({ points: ['text point'], questions: [] }));
        nimState.callNimHedged.mockResolvedValue(JSON.stringify({ points: ['image point'], questions: [] }));
        const imageBody = {
            action: 'assist',
            imageBase64: 'A'.repeat(100),
            slideId: '1784119272589#10',
            deckKey: '/api/pdf-proxy?key=deck-a.pdf',
            lang: 'en',
        };

        let res = await call(authPost({ action: 'assist', text: 'x'.repeat(40), lang: 'en' }));
        expect(res.statusCode).toBe(200);
        expect(nimState.callNim).toHaveBeenCalledTimes(1);

        res = await call(authPost(imageBody));
        expect(res.statusCode).toBe(200);
        expect(nimState.callNimHedged).toHaveBeenCalledTimes(1);

        res = await call(authPost({ ...imageBody, text: 'y'.repeat(40) }));
        expect(res.statusCode).toBe(200);
        expect(nimState.callNim).toHaveBeenCalledTimes(2);
        expect(nimState.callNimHedged).toHaveBeenCalledTimes(1);

        res = await call(authPost({ action: 'assist', lang: 'en' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_text' });

        res = await call(authPost({ ...imageBody, slideId: undefined }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_slide_id' });

        res = await call(authPost({ ...imageBody, deckKey: undefined }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_deck_key' });

        res = await call(authPost({ ...imageBody, lang: 'fr' }));
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid lang' });
    });

    it('uses deck key in present assist image cache keys to prevent slide id collisions', () => {
        const slideId = '1784119272589#3';

        const deckA = presentAssistImageCacheKey('en', '/api/pdf-proxy?key=deck-a.pdf', slideId);
        const deckB = presentAssistImageCacheKey('en', '/api/pdf-proxy?key=deck-b.pdf', slideId);

        expect(deckA).toMatch(/^present:assist:v1:img:[a-f0-9]{64}$/);
        expect(deckA).not.toBe(deckB);
    });
});
