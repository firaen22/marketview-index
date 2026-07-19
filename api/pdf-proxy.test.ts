import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

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
    class HeadObjectCommand {
        input: any;
        constructor(input: any) {
            this.input = input;
        }
    }
    return { S3Client, GetObjectCommand, HeadObjectCommand };
});

const { default: handler } = await import('./pdf-proxy');

const ENV_KEYS = [
    'CLOUDFLARE_R2_ENDPOINT',
    'CLOUDFLARE_R2_ACCESS_KEY_ID',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_BUCKET_NAME',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

const VALID_KEY = '1720000000000-abcdef123456-deck.pdf';

// Minimal stand-in for a Vercel response: only the surface pdf-proxy touches,
// plus the EventEmitter 'close' that a departing client triggers.
function makeRes() {
    const res: any = new EventEmitter();
    res.headers = {};
    res.written = 0;
    res.statusCode = 0;
    res.setHeader = (k: string, v: unknown) => { res.headers[k] = v; };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: unknown) => { res.body = body; return res; };
    res.end = () => res;
    res.write = (chunk: Buffer) => { res.written += chunk.length; return true; };
    res.destroyed = false;
    res.destroy = () => { res.destroyed = true; return res; };
    // Node's pipe() drives these on a real writable.
    res.on('pipe', () => {});
    return res;
}

// A slow, effectively endless body, like a large R2 object.
function makeSlowBody() {
    let pushed = 0;
    return new Readable({
        read() {
            setTimeout(() => this.push(Buffer.alloc(1024, 'x')), 1);
            pushed += 1;
            if (pushed > 5000) this.push(null);
        },
    });
}

describe('pdf-proxy streaming', () => {
    beforeEach(() => {
        s3State.send.mockReset();
        process.env.CLOUDFLARE_R2_ENDPOINT = 'https://r2.example';
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'id';
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'secret';
        process.env.CLOUDFLARE_R2_BUCKET_NAME = 'bucket';
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key] as string;
        }
    });

    it('settles and destroys the R2 stream when the client aborts mid-download', async () => {
        const body = makeSlowBody();
        s3State.send.mockResolvedValue({ Body: body, ContentType: 'application/pdf' });

        const req: any = { method: 'GET', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        const pending = handler(req, res);
        // Let the pipe start moving bytes, then simulate the client going away
        // (tab closed, or pdfjs cancelling an in-flight range request).
        await new Promise(r => setTimeout(r, 20));
        res.emit('close');

        // Without the abort handler this promise never settles and the function
        // would idle until the Vercel timeout.
        await expect(Promise.race([
            pending.then(() => 'settled'),
            new Promise(r => setTimeout(() => r('hung'), 1000)),
        ])).resolves.toBe('settled');

        expect(body.destroyed).toBe(true);
    });

    it('settles when the client aborts while the R2 GetObject is still in flight', async () => {
        const body = makeSlowBody();
        let releaseSend: (v: unknown) => void = () => {};
        s3State.send.mockReturnValue(new Promise(resolve => { releaseSend = resolve; }));

        const req: any = { method: 'GET', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        const pending = handler(req, res);
        await new Promise(r => setTimeout(r, 5));
        // Client disconnects before GetObject has returned — the narrow window
        // where no 'close' listener would have existed at all. Deliberately no
        // `res.destroyed` here: this asserts the listener armed ahead of the
        // round-trip, not the post-await destroyed check.
        res.emit('close');
        releaseSend({ Body: body, ContentType: 'application/pdf' });

        await expect(Promise.race([
            pending.then(() => 'settled'),
            new Promise(r => setTimeout(() => r('hung'), 1000)),
        ])).resolves.toBe('settled');

        expect(body.destroyed).toBe(true);
        expect(res.written).toBe(0);
    });

    it('still completes normally when the client stays connected', async () => {
        const body = Readable.from([Buffer.from('%PDF-1.7 ...')]);
        s3State.send.mockResolvedValue({ Body: body, ContentType: 'application/pdf', ContentLength: 12 });

        const req: any = { method: 'GET', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.written).toBe(12);
    });

    it('maps a deleted deck to 404 on HEAD, not 500', async () => {
        // HeadObject surfaces a missing key as NotFound, not NoSuchKey.
        s3State.send.mockRejectedValue(Object.assign(new Error('not found'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
        }));

        const req: any = { method: 'HEAD', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'PDF not found' });
    });

    it('survives an R2 body that errors while being destroyed on abort', async () => {
        // The early-return path: the client goes away DURING the GetObject
        // round-trip, so the stream's own 'error' handler (registered with
        // pipe(), further down) does not exist yet. An aborted IncomingMessage
        // can emit 'error' from destroy(); with no listener that is an
        // unhandled 'error' event, i.e. a crashed serverless function.
        const body = new Readable({
            read() { this.push(Buffer.alloc(1024, 'x')); },
            destroy(_err, cb) { cb(new Error('socket hang up')); },
        });
        let releaseSend: (v: unknown) => void = () => {};
        s3State.send.mockReturnValue(new Promise(resolve => { releaseSend = resolve; }));

        const req: any = { method: 'GET', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        const pending = handler(req, res);
        await new Promise(r => setTimeout(r, 5));
        res.emit('close');
        releaseSend({ Body: body, ContentType: 'application/pdf' });

        await expect(Promise.race([
            pending.then(() => 'settled'),
            new Promise(r => setTimeout(() => r('hung'), 1000)),
        ])).resolves.toBe('settled');
        // Give the destroy()-emitted 'error' a tick to surface.
        await new Promise(r => setTimeout(r, 20));
        expect(body.destroyed).toBe(true);
    });

    it('does not disguise a misconfigured bucket as a missing deck', async () => {
        // NoSuchBucket also carries a 404 status; treating it as "PDF not found"
        // would hide a total outage and skip the error log.
        s3State.send.mockRejectedValue(Object.assign(new Error('no bucket'), {
            name: 'NoSuchBucket',
            $metadata: { httpStatusCode: 404 },
        }));

        const req: any = { method: 'GET', query: { key: VALID_KEY }, headers: {} };
        const res = makeRes();

        await handler(req, res);

        expect(res.statusCode).toBe(500);
    });

    it('rejects a key that fails the R2 key pattern before touching S3', async () => {
        const req: any = { method: 'GET', query: { key: '../../etc/passwd' }, headers: {} };
        const res = makeRes();

        await handler(req, res);

        expect(res.statusCode).toBe(403);
        expect(s3State.send).not.toHaveBeenCalled();
    });
});
