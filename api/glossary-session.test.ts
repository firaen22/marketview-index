import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlossarySession } from '../lib/glossarySession';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        eval: vi.fn(),
        del: vi.fn(),
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

const { default: handler } = await import('./glossary-session');

function makeSession(partial: Partial<GlossarySession> = {}): GlossarySession {
    return {
        joinCode: 'ABCD2345',
        status: 'live',
        mode: 'gradual',
        currentPage: 0,
        maxPage: 0,
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
        // The /j resolver branch ends redirects without a body.
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

function sessionJson(partial: Partial<GlossarySession> = {}) {
    return JSON.stringify(makeSession(partial));
}

function legacySessionJson(partial: Partial<GlossarySession> = {}) {
    const { version: _version, ...session } = makeSession(partial);
    return JSON.stringify(session);
}

function lastSetSession(): GlossarySession {
    return JSON.parse(redisState.current.set.mock.calls.at(-1)[1]);
}

function sessionSetCalls() {
    return redisState.current.set.mock.calls.filter((c: any[]) => String(c[0]).startsWith('glossary:sess:'));
}

function sessionEvalCalls() {
    // Pointer compare-and-delete evals carry KEYS=['glossary:current']; the
    // session CAS script keys on glossary:sess:*.
    return redisState.current.eval.mock.calls.filter((c: any[]) => String(c[1]?.[0]).startsWith('glossary:sess:'));
}

function lastEvalSession(): GlossarySession {
    return JSON.parse(sessionEvalCalls().at(-1)[2][1]);
}

describe('glossary-session API handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(5000);
        process.env.PRESENT_API_KEY = 'secret';
        redisState.current = {
            get: vi.fn(),
            set: vi.fn().mockResolvedValue('OK'),
            eval: vi.fn().mockResolvedValue(1),
            del: vi.fn(),
            incr: vi.fn().mockResolvedValue(1),
            ttl: vi.fn().mockResolvedValue(60),
            expire: vi.fn().mockResolvedValue(1),
        };
    });

    it('returns 503 when Redis is not configured', async () => {
        redisState.current = null;

        const res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));

        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: 'Storage not configured' });
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('GET accepts lowercase codes, rate-limits, returns public cache, and sets no CORS headers', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({
            joins: 2,
            currentPage: 1,
            terms: [{ id: 'term', term: 'Term', explanation: { en: 'Text' }, firstPage: 1, unlockedAt: 5000 }],
        }));

        const res = await call(makeReq({ method: 'GET', query: { code: 'abcd2345' } }));

        expect(redisState.current.get).toHaveBeenCalledWith('glossary:sess:ABCD2345');
        expect(res.statusCode).toBe(200);
        expect(res.headers['Cache-Control']).toBe('public, s-maxage=3, stale-while-revalidate=5');
        expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
        expect(res.body.session).toEqual({
            status: 'live',
            mode: 'gradual',
            currentPage: 1,
            termCount: 1,
            joins: 2,
            updatedAt: 1000,
            terms: [{ id: 'term', term: 'Term', explanation: { en: 'Text' }, firstPage: 1, unlockedAt: 5000 }],
        });
    });

    it('GET returns non-cached 400, 404, and 429 responses', async () => {
        let res = await call(makeReq({ method: 'GET', query: { code: 'bad' } }));
        expect(res.statusCode).toBe(400);
        expect(res.headers['Cache-Control']).toBe('no-store');

        redisState.current.get.mockResolvedValue(null);
        res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));
        expect(res.statusCode).toBe(404);
        expect(res.headers['Cache-Control']).toBe('no-store');

        redisState.current.incr.mockResolvedValue(31);
        res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));
        expect(res.statusCode).toBe(429);
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('rate limiter fails open when Redis limiter calls fail', async () => {
        redisState.current.incr.mockRejectedValue(new Error('limiter down'));
        redisState.current.get.mockResolvedValue(sessionJson());
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));

        expect(res.statusCode).toBe(200);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('join is the only unauthenticated POST action and works on ended sessions', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({ status: 'ended', endedAt: 4000, joins: 4 }));

        const res = await call(makeReq({
            method: 'POST',
            body: { action: 'join', code: 'abcd2345' },
        }));

        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ joins: 5, status: 'ended', version: 1 });
        // keepTtl: the unauthenticated beacon must never extend a session's lifetime.
        expect(redisState.current.eval.mock.calls.at(-1)[2][2]).toBe('KEEPTTL');
    });

    it('POST 200 responses are never publicly cacheable', async () => {
        redisState.current.get.mockResolvedValue(sessionJson());

        const res = await call(makeReq({
            method: 'POST',
            body: { action: 'join', code: 'ABCD2345' },
        }));

        expect(res.statusCode).toBe(200);
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('requires presenter auth for push but not join', async () => {
        let res = await call(makeReq({
            method: 'POST',
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'en', terms: [] },
        }));
        expect(res.statusCode).toBe(401);

        redisState.current.get.mockResolvedValue(sessionJson());
        res = await call(makeReq({
            method: 'POST',
            body: { action: 'join', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(200);
    });

    it('push accepts empty terms and still updates currentPage, updatedAt, and TTL', async () => {
        redisState.current.get.mockResolvedValue(legacySessionJson({
            terms: [{ id: 'duration', term: 'Duration', explanation: { en: 'Old' }, firstPage: 1, unlockedAt: 1000 }],
        }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'abcd2345', page: 3, lang: 'en', terms: [] },
        }));

        expect(res.statusCode).toBe(200);
        expect(res.body.termLimitReached).toBe(false);
        expect(lastEvalSession()).toMatchObject({ currentPage: 3, updatedAt: 5000, version: 1 });
        expect(lastEvalSession().terms).toHaveLength(1);
        expect(redisState.current.eval.mock.calls.at(-1)[2][0]).toBe('0');
        expect(redisState.current.eval.mock.calls.at(-1)[2].slice(2)).toEqual(['EX', '43200']);
    });

    it('push merges duplicates, fills other languages, enriches aliases, and flags term cap overflow', async () => {
        const cappedTerms = Array.from({ length: 200 }, (_, index) => ({
            id: `term ${index}`,
            term: `Term ${index}`,
            explanation: { en: `English ${index}` },
            firstPage: 1,
            unlockedAt: 1000,
        }));
        redisState.current.get.mockResolvedValue(sessionJson({ terms: cappedTerms }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push',
                code: 'ABCD2345',
                page: 9,
                lang: 'zh-TW',
                terms: [
                    { term: 'Term 5', explanation: '中文 5' },
                    { term: 'bps', explanation: '模型文字' },
                ],
            },
        }));

        expect(res.statusCode).toBe(200);
        expect(res.body.termLimitReached).toBe(true);
        expect(lastEvalSession().terms).toHaveLength(200);
        expect(lastEvalSession().terms[5].firstPage).toBe(1);
        expect(lastEvalSession().terms[5].explanation).toEqual({ en: 'English 5', 'zh-TW': '中文 5' });
    });

    it('push with same epoch and lower pushSeq merges terms without changing currentPage', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({
            currentPage: 7,
            push: { epoch: 'epoch-a', seq: 5 },
        }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push',
                code: 'ABCD2345',
                page: 3,
                lang: 'en',
                terms: [{ term: 'duration', explanation: 'Duration' }],
                pushEpoch: 'epoch-a',
                pushSeq: 4,
            },
        }));

        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ currentPage: 7, push: { epoch: 'epoch-a', seq: 5 }, updatedAt: 5000 });
        expect(lastEvalSession().terms.map(term => term.id)).toEqual(['duration']);
    });

    it('push with a different epoch always updates currentPage', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({
            currentPage: 7,
            push: { epoch: 'epoch-a', seq: 5 },
        }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push',
                code: 'ABCD2345',
                page: 3,
                lang: 'en',
                terms: [],
                pushEpoch: 'epoch-b',
                pushSeq: 1,
            },
        }));

        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ currentPage: 3, push: { epoch: 'epoch-b', seq: 1 }, updatedAt: 5000 });
    });

    it('push without pushEpoch or pushSeq updates currentPage as before', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({
            currentPage: 7,
            push: { epoch: 'epoch-a', seq: 5 },
        }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 3, lang: 'en', terms: [] },
        }));

        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ currentPage: 3, push: { epoch: 'epoch-a', seq: 5 }, updatedAt: 5000 });
    });

    it('preserves the high-water mark when pushing back and exposes prior terms on GET', async () => {
        const pageFiveTerm = { id: 'page-five', term: 'Page Five', explanation: { en: 'Text' }, firstPage: 5, unlockedAt: 1000 };
        redisState.current.get.mockResolvedValue(sessionJson({ currentPage: 5, maxPage: 5, terms: [pageFiveTerm] }));

        await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 3, lang: 'en', terms: [] },
        }));

        const written = lastEvalSession();
        expect(written).toMatchObject({ currentPage: 3, maxPage: 5 });
        redisState.current.get.mockResolvedValue(JSON.stringify(written));
        const res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));
        expect(res.statusCode).toBe(200);
        expect(res.body.session.terms).toEqual([pageFiveTerm]);
    });

    it('advances maxPage for stale pushes without changing currentPage', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({
            currentPage: 5,
            maxPage: 5,
            push: { epoch: 'epoch-a', seq: 5 },
        }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push', code: 'ABCD2345', page: 9, lang: 'en', terms: [],
                pushEpoch: 'epoch-a', pushSeq: 4,
            },
        }));

        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ currentPage: 5, maxPage: 9, push: { epoch: 'epoch-a', seq: 5 } });
    });

    it('normalizes legacy gradual blobs without maxPage on GET', async () => {
        const { maxPage: _maxPage, ...legacy } = makeSession({
            currentPage: 2,
            terms: [
                { id: 'page-one', term: 'Page One', explanation: { en: 'Text' }, firstPage: 1, unlockedAt: 0 },
                { id: 'page-four', term: 'Page Four', explanation: { en: 'Text' }, firstPage: 4, unlockedAt: 0 },
            ],
        });
        redisState.current.get.mockResolvedValue(JSON.stringify(legacy));

        const res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));
        expect(res.statusCode).toBe(200);
        expect(res.body.session.terms.map((term: any) => term.id)).toEqual(['page-one']);
    });

    // Sweep 20 (agy): a session that was live across the maxPage deploy has no
    // maxPage field. Seeding it from currentPage (not 0) means the first
    // back-navigation after the deploy keeps the pages already shown.
    it('seeds a legacy blob\'s maxPage from currentPage on first write', async () => {
        const { maxPage: _maxPage, ...legacy } = makeSession({ currentPage: 5 });
        redisState.current.get.mockResolvedValue(JSON.stringify(legacy));

        await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 3, lang: 'en', terms: [] },
        }));

        expect(lastEvalSession()).toMatchObject({ currentPage: 3, maxPage: 5 });
    });

    // Sweep 20 (codex): only this API writes maxPage and validPage caps pushes
    // at 10000, so a non-integer or out-of-range value is corruption. It must
    // not become the visibility ceiling or be rewritten on the next mutation.
    it('drops a corrupt maxPage instead of exposing future terms through it', async () => {
        const futureTerm = { id: 'page-9999', term: 'Far', explanation: { en: 'Text' }, firstPage: 9999, unlockedAt: 0 };
        for (const bad of [1e9, 2.5, -1]) {
            redisState.current.get.mockResolvedValue(sessionJson({ currentPage: 2, maxPage: bad, terms: [futureTerm] }));
            const res = await call(makeReq({ method: 'GET', query: { code: 'ABCD2345' } }));
            expect(res.statusCode).toBe(200);
            expect(res.body.session.terms).toEqual([]);
        }
    });

    it('rejects pushSeq without pushEpoch', async () => {
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'en', terms: [], pushSeq: 1 },
        }));

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid push sequence' });
    });

    it.each([
        ['non-integer', 1.2],
        ['zero', 0],
    ])('rejects invalid pushSeq: %s', async (_label, pushSeq) => {
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'en', terms: [], pushEpoch: 'epoch-a', pushSeq },
        }));

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid push sequence' });
    });

    it.each([
        ['bad JSON body', '{bad'],
        ['non-object body', 'null'],
    ])('rejects %s', async (_label, body) => {
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body,
        }));

        expect(res.statusCode).toBe(400);
    });

    it.each([
        ['page zero', 0],
        ['negative page', -1],
        ['fractional page', 1.2],
        ['string page', '3'],
        ['NaN page', NaN],
        ['oversized page', 1e9],
    ])('rejects invalid push page: %s', async (_label, page) => {
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page, lang: 'en', terms: [] },
        }));

        expect(res.statusCode).toBe(400);
    });

    it('rejects invalid push lang and terms arrays over 10 items', async () => {
        let res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'fr', terms: [] },
        }));
        expect(res.statusCode).toBe(400);

        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push',
                code: 'ABCD2345',
                page: 1,
                lang: 'en',
                terms: Array.from({ length: 11 }, () => ({ term: 'A', explanation: 'B' })),
            },
        }));
        expect(res.statusCode).toBe(400);
    });

    it('push returns 404 for unknown code and 409 for ended sessions', async () => {
        redisState.current.get.mockResolvedValue(null);
        let res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'en', terms: [] },
        }));
        expect(res.statusCode).toBe(404);

        redisState.current.get.mockResolvedValue(sessionJson({ status: 'ended' }));
        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'push', code: 'ABCD2345', page: 1, lang: 'en', terms: [] },
        }));
        expect(res.statusCode).toBe(409);
    });

    it('start uses NX allocation; config, end keepAfter, and reopen use CAS with TTL', async () => {
        redisState.current.get.mockResolvedValue(null);
        let res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'start', mode: 'all', slideVersion: 123, keepAfter: true },
        }));
        expect(res.statusCode).toBe(200);
        expect(sessionSetCalls().at(-1)).toEqual([expect.stringMatching(/^glossary:sess:/), expect.any(String), { ex: 43200, nx: true }]);
        expect(JSON.parse(sessionSetCalls().at(-1)[1])).toMatchObject({ version: 0 });
        // start advertises the new session on the permanent-QR pointer.
        expect(redisState.current.set).toHaveBeenLastCalledWith('glossary:current', expect.stringMatching(/^[A-HJKMNP-Z2-9]{8}$/), { ex: 43200 });

        redisState.current.get.mockResolvedValue(sessionJson());
        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'config', code: 'ABCD2345', mode: 'all', keepAfter: false },
        }));
        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ mode: 'all', keepAfter: false, version: 1 });
        expect(sessionEvalCalls().at(-1)[2].slice(2)).toEqual(['EX', '43200']);

        redisState.current.get.mockResolvedValue(sessionJson({ keepAfter: true }));
        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'end', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ status: 'ended', endedAt: 5000, version: 1 });
        expect(sessionEvalCalls().at(-1)[2].slice(2)).toEqual(['EX', '604800']);

        redisState.current.get.mockResolvedValue(sessionJson({ status: 'ended', endedAt: 4000 }));
        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'reopen', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(200);
        expect(lastEvalSession()).toMatchObject({ status: 'live', endedAt: null, version: 1 });
        expect(sessionEvalCalls().at(-1)[2].slice(2)).toEqual(['EX', '43200']);
        expect(redisState.current.expire.mock.calls.some(call => String(call[0]).startsWith('glossary:sess:'))).toBe(false);
    });

    it('start retries once with a fresh code when the atomic NX claim collides', async () => {
        redisState.current.set
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('OK');

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'start', mode: 'all' },
        }));

        expect(res.statusCode).toBe(200);
        expect(sessionSetCalls()).toHaveLength(2);
        expect(sessionSetCalls()[0][2]).toEqual({ ex: 43200, nx: true });
        expect(sessionSetCalls()[1][2]).toEqual({ ex: 43200, nx: true });
        // The pointer records the code that actually won the NX claim.
        expect(redisState.current.set).toHaveBeenLastCalledWith('glossary:current', JSON.parse(sessionSetCalls()[1][1]).joinCode, { ex: 43200 });
    });

    it('retries a stale push against the fresh session so both interleaved pushes survive', async () => {
        redisState.current.get
            .mockResolvedValueOnce(sessionJson())
            .mockResolvedValueOnce(sessionJson({
                version: 1,
                terms: [{ id: 'duration', term: 'Duration', explanation: { en: 'Old' }, firstPage: 1, unlockedAt: 4000 }],
            }));
        redisState.current.eval
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(1);

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: {
                action: 'push',
                code: 'ABCD2345',
                page: 2,
                lang: 'en',
                terms: [{ term: 'basis point', explanation: 'One hundredth of a percentage point' }],
            },
        }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.eval).toHaveBeenCalledTimes(2);
        expect(lastEvalSession().version).toBe(2);
        expect(lastEvalSession().terms.map(term => term.id)).toEqual(['duration', 'basis point']);
    });

    it('returns 404 when CAS reports the session disappeared and 409 after retry exhaustion', async () => {
        redisState.current.get.mockResolvedValue(sessionJson());
        redisState.current.eval.mockResolvedValueOnce(-1);
        let res = await call(makeReq({
            method: 'POST',
            body: { action: 'join', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(404);

        redisState.current.get.mockResolvedValue(sessionJson());
        redisState.current.eval.mockResolvedValue(0);
        res = await call(makeReq({
            method: 'POST',
            body: { action: 'join', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: 'conflict' });
        expect(redisState.current.eval).toHaveBeenCalledTimes(5);
    });

    it('end keeps a short reopen grace TTL when keepAfter is false', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({ keepAfter: false }));

        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'end', code: 'ABCD2345' },
        }));

        expect(res.statusCode).toBe(200);
        expect(redisState.current.del).not.toHaveBeenCalled();
        expect(lastEvalSession()).toMatchObject({ status: 'ended', endedAt: 5000, updatedAt: 5000, version: 1 });
        expect(sessionEvalCalls().at(-1)[2].slice(2)).toEqual(['EX', '60']);
        // end clears the permanent-QR pointer via compare-and-delete.
        const pointerEvals = redisState.current.eval.mock.calls.filter((c: any[]) => c[1]?.[0] === 'glossary:current');
        expect(pointerEvals).toHaveLength(1);
        // KEYS[2] lets the Lua re-check liveness atomically (G1).
        expect(pointerEvals[0][1]).toEqual(['glossary:current', 'glossary:sess:ABCD2345']);
        expect(pointerEvals[0][2]).toEqual(['ABCD2345']);
    });

    it('reopen re-advertises the session on the permanent-QR pointer (A4)', async () => {
        redisState.current.get.mockResolvedValue(sessionJson({ status: 'ended', endedAt: 4000 }));
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'reopen', code: 'ABCD2345' },
        }));
        expect(res.statusCode).toBe(200);
        expect(redisState.current.set).toHaveBeenLastCalledWith('glossary:current', 'ABCD2345', { ex: 43200 });
    });

    it('a pointer-write failure never fails the presenter action (A5)', async () => {
        redisState.current.set.mockImplementation(async (key: string) => {
            if (key === 'glossary:current') throw new Error('pointer down');
            return 'OK';
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'start', mode: 'all' },
        }));
        expect(res.statusCode).toBe(200);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('?resolve=current serves the permanent-QR redirect from this function (12-fn cap)', async () => {
        redisState.current.get.mockImplementation(async (key: string) => {
            if (key === 'glossary:current') return 'ABCD2345';
            if (key === 'glossary:sess:ABCD2345') return sessionJson({ status: 'live' });
            return null;
        });

        const res = await call(makeReq({ method: 'GET', query: { resolve: 'current' } }));

        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/session/ABCD2345');
    });

    it('?resolve=current degrades to /join instead of 503 when Redis is unconfigured', async () => {
        redisState.current = null;

        const res = await call(makeReq({ method: 'GET', query: { resolve: 'current' } }));

        // Dispatched ahead of the storage guard: a scanner must never see 503.
        expect(res.statusCode).toBe(302);
        expect(res.headers['Location']).toBe('/join');
    });

    it('?resolve=current does not consume the 30/min presenter rate-limit bucket', async () => {
        redisState.current.get.mockResolvedValue(null);

        await call(makeReq({ method: 'GET', query: { resolve: 'current' } }));

        const buckets = redisState.current.incr.mock.calls.map((c: any[]) => String(c[0]));
        expect(buckets).toHaveLength(1);
        expect(buckets[0]).toMatch(/^glossary_join_rl/);
    });

    it('returns auth configuration errors and unknown action errors', async () => {
        delete process.env.PRESENT_API_KEY;
        let res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'start', mode: 'all' },
        }));
        expect(res.statusCode).toBe(503);

        process.env.PRESENT_API_KEY = 'secret';
        res = await call(makeReq({
            method: 'POST',
            headers: { 'x-api-key': 'secret' },
            body: { action: 'nope' },
        }));
        expect(res.statusCode).toBe(400);
    });
});
