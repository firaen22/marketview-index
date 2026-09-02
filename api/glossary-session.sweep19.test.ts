import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('corrupt stored session blobs (sweep 19)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        redisState.current.get.mockReset();
        redisState.current.incr.mockReset().mockResolvedValue(1);
        redisState.current.ttl.mockReset().mockResolvedValue(60);
        redisState.current.expire.mockReset().mockResolvedValue(1);
    });

    it('audience GET answers 404, not 500, when the blob has no terms array', async () => {
        redisState.current.get.mockResolvedValue({ status: 'live', mode: 'all', currentPage: 1 });
        const res = makeRes();
        await handler(makeReq({ query: { code: 'ABCD2345' } }) as any, res);
        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
    });

    it('audience GET answers 404 when the blob has a nonsense status', async () => {
        redisState.current.get.mockResolvedValue({ status: 'paused', mode: 'all', currentPage: 1, terms: [] });
        const res = makeRes();
        await handler(makeReq({ query: { code: 'ABCD2345' } }) as any, res);
        expect(res.statusCode).toBe(404);
    });

    it('audience GET answers 404 when the stored string is not valid JSON', async () => {
        redisState.current.get.mockResolvedValue('{"status":"live","mo');
        const res = makeRes();
        await handler(makeReq({ query: { code: 'ABCD2345' } }) as any, res);
        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
    });

    it('a well-formed blob still loads', async () => {
        redisState.current.get.mockResolvedValue({
            joinCode: 'ABCD2345', status: 'live', mode: 'all', currentPage: 1,
            maxPage: 0,
            slideVersion: 0, startedAt: 1, endedAt: null, keepAfter: true,
            joins: 0, terms: [], updatedAt: 1, version: 3,
        });
        const res = makeRes();
        await handler(makeReq({ query: { code: 'ABCD2345' } }) as any, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.session.status).toBe('live');
    });
});
