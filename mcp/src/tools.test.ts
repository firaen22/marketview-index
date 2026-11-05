import { describe, expect, it, vi } from 'vitest';
import {
    ACK_MAX_ATTEMPTS,
    fetchPresentStatus,
    isCommandAcked,
    postPresentCommand,
    shouldWaitForAck,
    waitForCommandAck,
} from './presentClient.js';
import type { PresentCommand, PresentStatusPayload } from './types.js';
import { TOOL_HANDLERS } from './tools.js';

describe('presentClient ack', () => {
    it('detects ack via applied or projector lid', () => {
        const status: PresentStatusPayload = {
            success: true,
            command: null,
            serverTime: 1,
            projector: { mode: 'index', page: 1, v: 1, at: 1, lid: 'cmd-1' },
            projectorLast: null,
            applied: null,
        };
        expect(isCommandAcked(status, 'cmd-1')).toBe(true);
        expect(isCommandAcked({ ...status, projector: null, applied: { id: 'cmd-2', kind: 'view', at: 1 } }, 'cmd-2')).toBe(true);
    });

    it('skips ack wait for page commands', () => {
        const page: PresentCommand = { v: 1, id: 'p1', kind: 'page', symbols: [], issuedAt: 1 };
        expect(shouldWaitForAck(page)).toBe(false);
    });

    it('polls until ack or max attempts', async () => {
        vi.useFakeTimers();
        let polls = 0;
        const fetchImpl = vi.fn(async () => {
            polls += 1;
            const lid = polls >= 3 ? 'abc' : undefined;
            return new Response(JSON.stringify({
                success: true,
                command: null,
                serverTime: polls,
                projector: { mode: 'index', page: 1, v: 1, at: 1, lid },
                projectorLast: null,
                applied: null,
            }), { status: 200 });
        });
        const promise = waitForCommandAck('https://example.com', 'abc', fetchImpl as typeof fetch, {
            intervalMs: 100,
            maxAttempts: ACK_MAX_ATTEMPTS,
        });
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result.acknowledged).toBe(true);
        expect(result.attempts).toBe(3);
        vi.useRealTimers();
    });
});

describe('presentClient HTTP errors', () => {
    it('surfaces POST failures', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
        await expect(postPresentCommand('https://example.com', 'key', { action: 'clear' }, fetchImpl as typeof fetch))
            .rejects.toMatchObject({ status: 401 });
    });

    it('GET status parses 429', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }));
        await expect(fetchPresentStatus('https://example.com', fetchImpl as typeof fetch))
            .rejects.toMatchObject({ status: 429 });
    });
});

describe('MCP tool handlers', () => {
    it('present_status works without PRESENT_API_KEY', async () => {
        const prev = process.env.PRESENT_API_KEY;
        delete process.env.PRESENT_API_KEY;
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            success: true,
            command: null,
            serverTime: 1,
            projector: null,
            projectorLast: null,
            applied: null,
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchImpl);
        const result = await TOOL_HANDLERS.present_status({});
        expect(result.isError).not.toBe(true);
        const parsed = JSON.parse(result.content[0].text) as { projectorLive: boolean };
        expect(parsed.projectorLive).toBe(false);
        process.env.PRESENT_API_KEY = prev;
        vi.unstubAllGlobals();
    });

    it('present_send rejects missing API key', async () => {
        const prev = process.env.PRESENT_API_KEY;
        delete process.env.PRESENT_API_KEY;
        const result = await TOOL_HANDLERS.present_send({ text: 'dashboard' });
        expect(result.isError).toBe(true);
        process.env.PRESENT_API_KEY = prev;
    });
});
