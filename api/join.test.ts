import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlossarySession } from '../lib/glossarySession';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        eval: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        expire: vi.fn(),
    } as any,
}));

vi.mock('../lib/redis.js', () => ({
    get redis() {
        return redisState.current;
    },
}));

const { default: handler } = await import('./join');

const CODE = 'ABCD2345';

function makeSession(partial: Partial<GlossarySession> = {}): GlossarySession {
    return {
        joinCode: CODE,
        status: 'live',
        mode: 'gradual',
        currentPage: 0,
        slideVersion: 0,
        startedAt: 1000,
        endedAt: null,
        keepAfter: true,
        joins: 0,
        terms: [],
        updatedAt: 1000,
        version: 0,
        ...partial,
    };
}

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
        ended: false,
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
        end: vi.fn(() => {
            res.ended = true;
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

// Wire the two GETs the handler makes: pointer key then session key.
function stubPointer(pointer: unknown, session?: unknown) {
    redisState.current.get.mockImplementation(async (key: string) => {
        if (key === 'glossary:current') return pointer;
        if (typeof key === 'string' && key.startsWith('glossary:sess:')) return session ?? null;
        return null;
    });
}

describe('/api/join permanent QR resolver', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        redisState.current = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue('OK'),
            eval: vi.fn().mockResolvedValue(1),
            incr: vi.fn().mockResolvedValue(1),
            ttl: vi.fn().mockResolvedValue(60),
            expire: vi.fn().mockResolvedValue(1),
        };
    });

    it('redirects 302 to the live session when the pointer is valid (A6)', async () => {
        stubPointer(CODE, JSON.stringify(makeSession()));
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe(`/session/${CODE}`);
        expect(res.headers['Cache-Control']).toContain('no-store');
    });

    it('accepts an already-deserialized session object from Upstash', async () => {
        stubPointer(CODE, makeSession());
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe(`/session/${CODE}`);
    });

    it('redirects to /join when no pointer exists (A7)', async () => {
        stubPointer(null);
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
    });

    it.each([
        ['CRLF injection', 'AAAA\r\nSet-Cookie: x=1'],
        ['lowercase', 'abcd2345'],
        ['path traversal', '../../evil'],
        ['protocol-relative', '//evil.com'],
        ['empty string', ''],
        ['7 chars', 'ABCD234'],
        ['9 chars', 'ABCD23456'],
        ['excluded letter L', 'ABCDL345'],
        ['non-string number', 12345678],
    ])('poisoned pointer (%s) fails closed to /join and never reaches a header (A8)', async (_label, poisoned) => {
        stubPointer(poisoned);
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
        if (typeof poisoned === 'string' && poisoned) {
            expect(JSON.stringify(res.headers)).not.toContain(JSON.stringify(poisoned).slice(1, -1));
        }
        // A poisoned pointer is invalid, not stale — no cleanup call for it.
        expect(redisState.current.eval).not.toHaveBeenCalled();
    });

    it('all-digit code deserialized to a number by Upstash still resolves (F1)', async () => {
        const digitCode = '23456789';
        redisState.current.get.mockImplementation(async (key: string) => {
            if (key === 'glossary:current') return 23456789;
            if (key === `glossary:sess:${digitCode}`) return JSON.stringify(makeSession({ joinCode: digitCode }));
            return null;
        });
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe(`/session/${digitCode}`);
    });

    it('stale pointer (session missing) redirects /join and compare-and-deletes the pointer (A9)', async () => {
        stubPointer(CODE, null);
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
        expect(redisState.current.eval).toHaveBeenCalledTimes(1);
        const [, keys, args] = redisState.current.eval.mock.calls[0];
        // KEYS[2] lets the Lua re-check liveness atomically, so a concurrent
        // reopen of the same code cannot lose its re-advertised pointer (G1).
        expect(keys).toEqual(['glossary:current', `glossary:sess:${CODE}`]);
        expect(args).toEqual([CODE]);
    });

    it('ended session redirects /join and cleans the pointer (A9)', async () => {
        stubPointer(CODE, JSON.stringify(makeSession({ status: 'ended' })));
        const res = await call(makeReq());
        expect(res.headers['Location']).toBe('/join');
        expect(redisState.current.eval).toHaveBeenCalledTimes(1);
    });

    it('unparseable session JSON fails closed to /join AND self-heals the pointer (G4)', async () => {
        stubPointer(CODE, '{not json');
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
        // The corrupt blob must reach the stale branch, not throw past it.
        expect(redisState.current.eval).toHaveBeenCalledTimes(1);
    });

    it('format=json returns 200 with the live code, never a redirect (A10)', async () => {
        stubPointer(CODE, JSON.stringify(makeSession()));
        const res = await call(makeReq({ query: { format: 'json' } }));
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ code: CODE });
        expect(res.headers['Location']).toBeUndefined();
        expect(res.headers['Cache-Control']).toContain('s-maxage=3');
    });

    it('format=json returns {code:null} when nothing is live (A10)', async () => {
        stubPointer(null);
        const res = await call(makeReq({ query: { format: 'json' } }));
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ code: null });
    });

    it('format=json returns {code:null} when redis throws', async () => {
        redisState.current.get.mockRejectedValue(new Error('redis down'));
        const res = await call(makeReq({ query: { format: 'json' } }));
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ code: null });
    });

    it('redis === null falls back to /join redirect, not 503 (A11)', async () => {
        redisState.current = null;
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
    });

    it('any thrown redis error redirects /join, never 500', async () => {
        redisState.current.get.mockRejectedValue(new Error('boom'));
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
    });

    it('HEAD gets the same 302', async () => {
        stubPointer(CODE, JSON.stringify(makeSession()));
        const res = await call(makeReq({ method: 'HEAD' }));
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe(`/session/${CODE}`);
        expect(res.ended).toBe(true);
    });

    it.each(['POST', 'PUT', 'DELETE'])('%s is 405 (A12)', async method => {
        const res = await call(makeReq({ method }));
        expect(res.statusCode).toBe(405);
    });

    it('240th request passes, 241st scanner degrades to /join, not a JSON 429 (A13/G2)', async () => {
        stubPointer(CODE, JSON.stringify(makeSession()));
        redisState.current.incr.mockResolvedValueOnce(240);
        const ok = await call(makeReq());
        expect(ok.statusCode).toBe(302);
        redisState.current.incr.mockResolvedValueOnce(241);
        const limited = await call(makeReq());
        expect(limited.statusCode).toBe(302);
        expect(limited.headers['Location']).toBe('/join');
    });

    it('rate-limited JSON poll still gets a 429 so pollers back off (G2)', async () => {
        redisState.current.incr.mockResolvedValueOnce(241);
        const res = await call(makeReq({ query: { format: 'json' } }));
        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: 'rate_limited' });
    });

    it('rate limiter failure fails open (matches glossary-session behavior)', async () => {
        stubPointer(CODE, JSON.stringify(makeSession()));
        redisState.current.incr.mockRejectedValue(new Error('rl down'));
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe(`/session/${CODE}`);
    });

    it('pointer cleanup failure still answers /join (never 500)', async () => {
        stubPointer(CODE, null);
        redisState.current.eval.mockRejectedValue(new Error('eval down'));
        const res = await call(makeReq());
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
    });
});
