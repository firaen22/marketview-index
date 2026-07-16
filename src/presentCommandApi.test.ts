import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAssist, fetchProjectorState, PresentCommandApiError, sendPresentPageCommand } from './presentCommandApi';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('presentCommandApi additions', () => {
    it('fetchProjectorState returns validated projector state and server time', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 10_000,
            projector: { mode: 'pdf', page: 2, v: 0, at: 9000 },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({
            serverTime: 10_000,
            projector: { mode: 'pdf', page: 2, v: 0, at: 9000 },
        });
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/present-command', { signal: undefined });
    });

    it('fetchProjectorState drops malformed projector state client-side', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 10_000,
            projector: { mode: 'evil', page: 2, v: 0, at: 9000 },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({ serverTime: 10_000, projector: null });
    });

    it('sendPresentPageCommand posts the direction and returns the validated command', async () => {
        const command = { v: 1, id: 'p1', kind: 'page', symbols: [], direction: 'next', issuedAt: 1000 };
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, command }));

        await expect(sendPresentPageCommand('next')).resolves.toEqual(command);
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/present-command', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ action: 'page', direction: 'next' }),
        }));
    });

    it('sendPresentPageCommand rejects a malformed command payload', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, command: { kind: 'page' } }));

        await expect(sendPresentPageCommand('prev')).rejects.toThrow(PresentCommandApiError);
    });

    it('fetchAssist validates canonical assist response shape', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            assist: { points: [' point '], questions: [{ q: ' q ', a: ' a ' }], extra: true },
        }));

        await expect(fetchAssist('x'.repeat(40), 'en')).resolves.toEqual({
            points: ['point'],
            questions: [{ q: 'q', a: 'a' }],
        });
    });

    it('fetchAssist rejects malformed successful payloads', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ assist: { points: [], questions: [] } }));

        await expect(fetchAssist('x'.repeat(40), 'en')).rejects.toBeInstanceOf(PresentCommandApiError);
    });
});
