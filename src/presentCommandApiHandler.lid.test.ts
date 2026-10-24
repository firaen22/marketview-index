import { beforeEach, describe, expect, it, vi } from 'vitest';

function atFromJson(raw: string | null): number {
    if (!raw) return 0;
    try {
        const o = JSON.parse(raw) as { at?: number };
        return typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0;
    } catch {
        return 0;
    }
}

function installRedisMemory() {
    const mem = new Map<string, string>();
    return {
        get: vi.fn(async (key: string) => (mem.has(key) ? mem.get(key)! : null)),
        set: vi.fn(async (key: string, value: string) => {
            mem.set(key, value);
            return 'OK';
        }),
        incr: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(60),
        expire: vi.fn().mockResolvedValue(1),
        lrange: vi.fn().mockResolvedValue([]),
        lrem: vi.fn().mockResolvedValue(1),
        eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
            if (script.includes('incoming_at')) {
                const incoming = JSON.parse(args[0]);
                const storedAt = Math.max(
                    atFromJson(mem.get(keys[0]) ?? null),
                    atFromJson(mem.get(keys[1]) ?? null),
                );
                if (incoming.at < storedAt) return 0;
                mem.set(keys[0], args[0]);
                mem.set(keys[1], args[0]);
                return 1;
            }
            mem.set(keys[0], args[0]);
            return 1;
        }),
        _mem: mem,
    };
}

const redisState = vi.hoisted(() => ({
    current: installRedisMemory(),
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
        redisState.current = installRedisMemory();
    });

    it('stores valid lid and omits absent or malformed lid without rejecting projector state', async () => {
        const lid = '550e8400-e29b-41d4-a716-446655440000';

        let res = await call({ st: '1', mode: 'slide', page: '3', v: '7', lid });
        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toEqual({ mode: 'slide', page: 3, v: 7, at: 5000, lid });
        expect(redisState.current.eval).toHaveBeenCalled();

        for (const badLid of ['x'.repeat(65), 'bad_id']) {
            redisState.current.eval.mockClear();
            res = await call({ st: '1', mode: 'pdf', page: '3', v: '7', lid: badLid });
            expect(res.statusCode).toBe(200);
            expect(res.body.projector).toEqual({ mode: 'pdf', page: 3, v: 7, at: 5000 });
            expect(redisState.current.eval).toHaveBeenCalled();
        }

        res = await call({ st: '1', mode: 'pdf', page: '3', v: '7' });
        expect(res.statusCode).toBe(200);
        expect(res.body.projector).toEqual({ mode: 'pdf', page: 3, v: 7, at: 5000 });
    });
});
