import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
    current: {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        expire: vi.fn(),
        lpop: vi.fn(),
    } as any,
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
        callNim: vi.fn(),
        callNimHedged: vi.fn(),
    };
});

const { default: handler } = await import('../api/present-command');

function makeReq(query: Record<string, unknown>) {
    return {
        method: 'GET',
        // Projector reports (st=1) mutate state, so the poll carries the key.
        headers: { 'x-api-key': 'secret' },
        query,
        socket: { remoteAddress: '127.0.0.1' },
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

async function call(query: Record<string, unknown>) {
    const res = makeRes();
    await handler(makeReq(query) as any, res);
    return res;
}

describe('present-command API projector lid reports', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(5000);
        process.env.PRESENT_API_KEY = 'secret';
        redisState.current = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue('OK'),
            incr: vi.fn().mockResolvedValue(1),
            ttl: vi.fn().mockResolvedValue(60),
            expire: vi.fn().mockResolvedValue(1),
            lpop: vi.fn().mockResolvedValue(null),
        };
    });

    it('stores valid lid and omits absent or malformed lid without rejecting projector state', async () => {
        const lid = '550e8400-e29b-41d4-a716-446655440000';

        let res = await call({ st: '1', mode: 'slide', page: '3', v: '7', lid });
        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toEqual({ mode: 'slide', page: 3, v: 7, at: 5000, lid });
        expect(redisState.current.set).toHaveBeenCalledWith(
            'present:pstate:v1',
            JSON.stringify({ mode: 'slide', page: 3, v: 7, at: 5000, lid }),
            { ex: 15 },
        );

        for (const badLid of ['x'.repeat(65), 'bad_id']) {
            redisState.current.set.mockClear();
            res = await call({ st: '1', mode: 'pdf', page: '3', v: '7', lid: badLid });
            expect(res.statusCode).toBe(200);
            expect(res.body.projector).toEqual({ mode: 'pdf', page: 3, v: 7, at: 5000 });
            expect(redisState.current.set).toHaveBeenCalledWith(
                'present:pstate:v1',
                JSON.stringify({ mode: 'pdf', page: 3, v: 7, at: 5000 }),
                { ex: 15 },
            );
        }

        res = await call({ st: '1', mode: 'pdf', page: '3', v: '7' });
        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toEqual({ mode: 'pdf', page: 3, v: 7, at: 5000 });
    });
});
