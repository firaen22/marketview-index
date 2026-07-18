import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3State = vi.hoisted(() => ({
    send: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
    class S3Client {
        send = s3State.send;
    }
    class DeleteObjectCommand {
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
    return { S3Client, DeleteObjectCommand, PutObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://r2.example/presigned'),
}));

const { default: handler } = await import('./present-pdf');

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
        headers: { 'x-api-key': 'test-key' },
        body,
    } as any;
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        payload: undefined,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(value: unknown) {
            res.payload = value;
            return res;
        },
        end() {
            return res;
        },
        setHeader() {
            return res;
        },
    };
    return res;
}

beforeEach(() => {
    process.env.CLOUDFLARE_R2_ENDPOINT = 'https://r2.example';
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'id';
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'secret';
    process.env.CLOUDFLARE_R2_BUCKET_NAME = 'bucket';
    process.env.PRESENT_API_KEY = 'test-key';
    s3State.send.mockReset();
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        const value = originalEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe('present-pdf size validation (sweep 10)', () => {
    it('rejects a fractional size with 400 instead of passing it to S3', async () => {
        const res = makeRes();
        await handler(makeReq({ filename: 'deck.pdf', size: 1.5 }), res);
        expect(res.statusCode).toBe(400);
    });

    it('still accepts an integer size', async () => {
        const res = makeRes();
        await handler(makeReq({ filename: 'deck.pdf', size: 1024 }), res);
        expect(res.statusCode).toBe(200);
        expect(res.payload.uploadUrl).toBe('https://r2.example/presigned');
    });
});
