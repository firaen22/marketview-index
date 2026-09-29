import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNim } from './nim';

afterEach(() => vi.restoreAllMocks());

describe('callNim deferred deadline', () => {
    it('stops a serial key/model chain at the total deadline', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }) as Promise<Response>);
        const started = Date.now();
        await expect(callNim(['k1', 'k2'], ['m1', 'm2'], [], 10, { deadlineMs: 100, timeoutMs: 1000 }))
            .rejects.toThrow('NIM deadline exceeded');
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('keeps the per-attempt timeout when no total deadline is supplied', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }) as Promise<Response>);
        await expect(callNim(['k1'], ['m1'], [], 10, { timeoutMs: 10 }))
            .rejects.toThrow('All NIM keys/models failed');
    });
    it('accepts a fractional total deadline', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
        await expect(callNim(['k1'], ['m1'], [], 10, { deadlineMs: 0.5 })).resolves.toBe('ok');
    });
});
