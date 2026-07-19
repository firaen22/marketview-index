import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        expire: vi.fn(),
    } as any,
}));

const googleState = vi.hoisted(() => ({
    generateContent: vi.fn(),
}));

const nimState = vi.hoisted(() => ({
    getNimApiKeys: vi.fn(),
    callNim: vi.fn(),
    callNimHedged: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    // Must be a real constructor: explain-jargon.ts does `new GoogleGenAI(...)`.
    // An arrow-returning vi.fn() is not newable and throws "is not a constructor".
    GoogleGenAI: class {
        models = { generateContent: googleState.generateContent };
    },
}));

vi.mock('../lib/nim.js', () => ({
    getNimApiKeys: nimState.getNimApiKeys,
    callNim: nimState.callNim,
    callNimHedged: nimState.callNimHedged,
    NIM_TEXT_MODELS: ['nim-text'],
    NIM_VISION_MODELS: ['nim-vision'],
}));

vi.mock('../lib/redis.js', () => ({
    get redis() {
        return redisState.current;
    },
}));

const { default: handler } = await import('./explain-jargon');

const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_API_KEY_FALLBACK', 'PRESENT_API_KEY'];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const TERM_JSON = '{"terms":[{"term":"Duration","explanation":"Interest-rate sensitivity."}]}';
const EMPTY_JSON = '{"terms":[]}';
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

function makeRedis() {
    const counts = new Map<string, number>();
    return {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        incr: vi.fn(async (key: string) => {
            const next = (counts.get(key) ?? 0) + 1;
            counts.set(key, next);
            return next;
        }),
        ttl: vi.fn().mockResolvedValue(60),
        expire: vi.fn().mockResolvedValue(1),
    };
}

function makeReq(headers: Record<string, unknown> = {}, ip = '203.0.113.10') {
    return {
        method: 'POST',
        headers,
        socket: { remoteAddress: ip },
        body: { text: 'Duration measures bond sensitivity.', lang: 'en', slideId: '1000#1' },
    };
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        headersSent: false,
        body: undefined,
        setHeader: vi.fn(),
        status: vi.fn((status: number) => {
            res.statusCode = status;
            return res;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            res.headersSent = true;
            return res;
        }),
    };
    return res;
}

async function call(req: any) {
    const res = makeRes();
    await handler(req as any, res);
    return res;
}

describe('explain-jargon cache gate and rate limit', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        redisState.current = makeRedis();
        googleState.generateContent.mockReset();
        googleState.generateContent.mockResolvedValue({ text: TERM_JSON });
        nimState.getNimApiKeys.mockReset();
        nimState.getNimApiKeys.mockReturnValue([]);
        nimState.callNim.mockReset();
        nimState.callNimHedged.mockReset();
        process.env.GEMINI_API_KEY = 'abcdefghijklmnopqrstuvwxyz';
        delete process.env.GEMINI_API_KEY_FALLBACK;
        process.env.PRESENT_API_KEY = 'secret';
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const value = originalEnv[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    it('writes a non-empty authenticated slide result to the v2 cache with the 30-day ttl', async () => {
        const res = await call(makeReq({ 'x-api-key': 'secret' }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.set).toHaveBeenCalledTimes(1);
        expect(redisState.current.set).toHaveBeenCalledWith(
            expect.stringMatching(/^jargon:v2:slide:en:/),
            JSON.stringify([{ term: 'Duration', explanation: 'Interest-rate sensitivity.' }]),
            { ex: THIRTY_DAYS_S },
        );
    });

    it('does not write unauthenticated non-empty results but still returns the terms', async () => {
        const res = await call(makeReq());

        expect(res.statusCode).toBe(200);
        // Assert on term identity, not explanation wording: responses pass through
        // applyGlossaryOverride (architecture Invariant 3), so the returned explanation
        // is the curated glossary entry, not the raw model text. The raw text is what
        // gets CACHED — that is asserted separately above.
        expect(res.body.success).toBe(true);
        expect(res.body.terms.map((t: any) => t.term)).toEqual(['Duration']);
        expect(redisState.current.set).not.toHaveBeenCalled();
    });

    it('does not write with the wrong x-api-key', async () => {
        const res = await call(makeReq({ 'x-api-key': 'wrong' }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.set).not.toHaveBeenCalled();
    });

    it('does not write when PRESENT_API_KEY is unset even if a key is supplied', async () => {
        delete process.env.PRESENT_API_KEY;

        const res = await call(makeReq({ 'x-api-key': 'secret' }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.set).not.toHaveBeenCalled();
    });

    it('does not write empty term arrays even when authenticated', async () => {
        googleState.generateContent.mockResolvedValue({ text: EMPTY_JSON });

        const res = await call(makeReq({ 'x-api-key': 'secret' }));

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, terms: [] });
        expect(redisState.current.set).not.toHaveBeenCalled();
    });

    it('does not increment the rate limiter on cache hits', async () => {
        redisState.current.get.mockResolvedValue(JSON.stringify([{ term: 'Duration', explanation: 'Cached.' }]));

        const res = await call(makeReq());

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.source).toBe('cache');
        expect(res.body.terms.map((t: any) => t.term)).toEqual(['Duration']);
        expect(redisState.current.incr).not.toHaveBeenCalled();
        expect(googleState.generateContent).not.toHaveBeenCalled();
    });

    it('returns 429 on the 241st same-IP miss without making a model call', async () => {
        for (let i = 0; i < 240; i += 1) {
            const res = await call(makeReq({}, '198.51.100.20'));
            expect(res.statusCode).toBe(200);
        }

        const limited = await call(makeReq({}, '198.51.100.20'));

        expect(limited.statusCode).toBe(429);
        expect(limited.body).toEqual({ error: 'rate_limited' });
        expect(redisState.current.get).toHaveBeenCalledTimes(241);
        expect(redisState.current.incr).toHaveBeenCalledTimes(241);
        expect(googleState.generateContent).toHaveBeenCalledTimes(240);
    });

    it('fails open when redis throws during rate limiting', async () => {
        redisState.current.incr.mockRejectedValue(new Error('redis down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await call(makeReq());

        expect(res.statusCode).toBe(200);
        expect(res.body.terms.map((t: any) => t.term)).toEqual(['Duration']);
        expect(googleState.generateContent).toHaveBeenCalledTimes(1);
    });

    it('uses separate anonymous and authenticated buckets for the same IP', async () => {
        for (let i = 0; i < 241; i += 1) {
            await call(makeReq({}, '192.0.2.30'));
        }

        const authed = await call(makeReq({ 'x-api-key': 'secret' }, '192.0.2.30'));

        expect(authed.statusCode).toBe(200);
        expect(authed.body.terms.map((t: any) => t.term)).toEqual(['Duration']);
        expect(redisState.current.incr).toHaveBeenLastCalledWith('jargon_rl_k_192.0.2.30');
    });
});
