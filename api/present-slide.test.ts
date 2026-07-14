import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3State = vi.hoisted(() => ({
    send: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
    class S3Client {
        send = s3State.send;
    }
    class GetObjectCommand {
        input: any;
        constructor(input: any) {
            this.input = input;
        }
    }
    class PutObjectCommand {
        input: any;
        constructor(input: any) {
            this.input = input;
        }
    }
    return { S3Client, GetObjectCommand, PutObjectCommand };
});

const { default: handler } = await import('./present-slide');

const ENV_KEYS = [
    'CLOUDFLARE_R2_ENDPOINT',
    'CLOUDFLARE_R2_ACCESS_KEY_ID',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_BUCKET_NAME',
    'PRESENT_API_KEY',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function makeReq(body: any) {
    return {
        method: 'POST',
        headers: { 'x-api-key': 'secret' },
        body,
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

async function call(body: any) {
    const res = makeRes();
    await handler(makeReq(body) as any, res);
    return res;
}

function streamJson(value: unknown) {
    return Readable.from([Buffer.from(JSON.stringify(value))]);
}

function commandName(command: any) {
    return command.constructor.name;
}

function putCommands() {
    return s3State.send.mock.calls
        .map(call => call[0])
        .filter(command => commandName(command) === 'PutObjectCommand');
}

describe('present-slide API handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(5000);
        s3State.send.mockReset();
        process.env.CLOUDFLARE_R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'access-key';
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'secret-key';
        process.env.CLOUDFLARE_R2_BUCKET_NAME = 'bucket';
        process.env.PRESENT_API_KEY = 'secret';
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const value = originalEnv[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    it('rejects a save older than the stored slide without writing', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 2000 }) };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 1000 });

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: 'Stale save: newer content already stored' });
        expect(putCommands()).toHaveLength(0);
    });

    it('stores a newer save with the client updatedAt', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }) };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored).toEqual({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });
        expect(res.body.slide.updatedAt).toBe(2000);
    });

    it('accepts an equal-timestamp save (idempotent manual re-save)', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 2000 }) };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored).toEqual({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });
    });

    it('clamps a far-future client updatedAt to now + 60s', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }) };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 999_999_999 });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored.updatedAt).toBe(65_000); // Date.now mocked to 5000
    });

    it('stores the first save when no slide exists yet (NoSuchKey)', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                const err: any = new Error('no key');
                err.name = 'NoSuchKey';
                throw err;
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'first', updatedAt: 2000 });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored).toEqual({ mode: 'markdown', content: 'first', updatedAt: 2000 });
    });

    it('fails open when the conflict read errors (availability over ordering)', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                throw new Error('R2 unavailable');
            }
            return {};
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(putCommands()).toHaveLength(1);
    });

    it('server-stamps legacy saves without a conflict read', async () => {
        s3State.send.mockResolvedValue({});

        const res = await call({ mode: 'markdown', content: 'legacy' });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored).toEqual({ mode: 'markdown', content: 'legacy', updatedAt: 5000 });
        expect(s3State.send.mock.calls.map(call => commandName(call[0]))).toEqual(['PutObjectCommand']);
    });

    it('treats non-numeric updatedAt as a legacy save', async () => {
        s3State.send.mockResolvedValue({});

        const res = await call({ mode: 'markdown', content: 'legacy', updatedAt: '6000' });
        const stored = JSON.parse(putCommands()[0].input.Body);

        expect(res.statusCode).toBe(200);
        expect(stored).toEqual({ mode: 'markdown', content: 'legacy', updatedAt: 5000 });
        expect(s3State.send.mock.calls.map(call => commandName(call[0]))).toEqual(['PutObjectCommand']);
    });
});
