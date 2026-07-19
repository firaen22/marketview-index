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

function commands(name: string) {
    return s3State.send.mock.calls
        .map(call => call[0])
        .filter(command => commandName(command) === name);
}

function getCommands() {
    return commands('GetObjectCommand');
}

function putCommands() {
    return commands('PutObjectCommand');
}

function preconditionFailed() {
    const err: any = new Error('precondition failed');
    err.name = 'PreconditionFailed';
    return err;
}

describe('present-slide API handler CAS saves', () => {
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

    it('uses IfMatch from the existing object ETag', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(putCommands()[0].input.IfMatch).toBe('"etag-1"');
    });

    it('re-reads after PreconditionFailed and uses the second ETag', async () => {
        let getCount = 0;
        let putCount = 0;
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                getCount += 1;
                return {
                    Body: streamJson({ mode: 'markdown', content: `stored-${getCount}`, updatedAt: 1000 }),
                    ETag: `"etag-${getCount}"`,
                };
            }
            putCount += 1;
            if (putCount === 1) throw preconditionFailed();
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(getCommands()).toHaveLength(2);
        expect(putCommands()).toHaveLength(2);
        expect(putCommands()[1].input.IfMatch).toBe('"etag-2"');
    });

    it('returns 503 after all CAS attempts fail', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            throw preconditionFailed();
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(503);
        expect(res.statusCode).not.toBe(409);
        expect(res.body).toEqual({ error: 'Concurrent save conflict; retry save' });
        expect(putCommands()).toHaveLength(3);
    });

    it('returns 409 when a retry read observes a newer stored slide without a fourth put', async () => {
        let getCount = 0;
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                getCount += 1;
                return {
                    Body: streamJson({
                        mode: 'markdown',
                        content: `stored-${getCount}`,
                        updatedAt: getCount === 1 ? 1000 : 3000,
                    }),
                    ETag: `"etag-${getCount}"`,
                };
            }
            throw preconditionFailed();
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: 'Stale save: newer content already stored' });
        expect(getCommands()).toHaveLength(2);
        expect(putCommands()).toHaveLength(1);
    });

    it('uses IfNoneMatch for NoSuchKey reads and no IfMatch', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                const err: any = new Error('no key');
                err.name = 'NoSuchKey';
                throw err;
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'first', updatedAt: 2000 });
        const putInput = putCommands()[0].input;

        expect(res.statusCode).toBe(200);
        expect(putInput.IfNoneMatch).toBe('*');
        expect('IfMatch' in putInput).toBe(false);
    });

    it('fails open with no conditional when the conflict read errors', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                throw new Error('R2 unavailable');
            }
            return {};
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });
        const putInput = putCommands()[0].input;

        expect(res.statusCode).toBe(200);
        expect('IfMatch' in putInput).toBe(false);
        expect('IfNoneMatch' in putInput).toBe(false);
    });

    it('retries a 412 precondition failure without a name', async () => {
        let putCount = 0;
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            putCount += 1;
            if (putCount === 1) throw { $metadata: { httpStatusCode: 412 } };
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(putCommands()).toHaveLength(2);
    });

    it('returns 500 without retrying genuine non-CAS PutObject errors', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            const err: any = new Error('denied');
            err.name = 'AccessDenied';
            throw err;
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(500);
        expect(putCommands()).toHaveLength(1);
    });

    it('retries ConditionalRequestConflict', async () => {
        let putCount = 0;
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            putCount += 1;
            if (putCount === 1) throw { name: 'ConditionalRequestConflict' };
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(putCommands()).toHaveLength(2);
    });

    it('returns 500 without retrying a bare 409', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"etag-1"' };
            }
            throw { $metadata: { httpStatusCode: 409 } };
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(500);
        expect(putCommands()).toHaveLength(1);
    });

    it('omits IfMatch when the ETag is undefined', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: undefined };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect('IfMatch' in putCommands()[0].input).toBe(false);
    });

    it('omits IfMatch when the ETag is null', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: null };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect('IfMatch' in putCommands()[0].input).toBe(false);
    });

    it('omits IfMatch when the ETag is an empty string', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '' };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect('IfMatch' in putCommands()[0].input).toBe(false);
    });

    it('passes quoted ETags through byte-identically', async () => {
        s3State.send.mockImplementation(async (command: any) => {
            if (commandName(command) === 'GetObjectCommand') {
                return { Body: streamJson({ mode: 'markdown', content: 'stored', updatedAt: 1000 }), ETag: '"abc123"' };
            }
            return {};
        });

        const res = await call({ mode: 'markdown', content: 'incoming', updatedAt: 2000 });

        expect(res.statusCode).toBe(200);
        expect(putCommands()[0].input.IfMatch).toBe('"abc123"');
    });
});
