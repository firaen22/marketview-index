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
            projector: { mode: 'pdf', page: 2, v: 0, at: 9000, lid: 'cmd-1' },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({
            serverTime: 10_000,
            projector: { mode: 'pdf', page: 2, v: 0, at: 9000, lid: 'cmd-1' },
            projectorLast: null,
            applied: null,
            control: null,
        });
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/present-command', { signal: undefined });
    });

    it('fetchProjectorState drops malformed projector state client-side', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 10_000,
            projector: { mode: 'evil', page: 2, v: 0, at: 9000 },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({
            serverTime: 10_000,
            projector: null,
            projectorLast: null,
            applied: null,
            control: null,
        });
    });

    it('fetchProjectorState keeps core projector state when display is malformed', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 10_000,
            projector: { mode: 'index', page: 1, v: 0, at: 9000, display: { schema: 1, iw: 0, ih: 720, dpr: 1 } },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({
            serverTime: 10_000,
            projector: { mode: 'index', page: 1, v: 0, at: 9000 },
            projectorLast: null,
            applied: null,
            control: null,
        });
    });

    it('fetchProjectorState parses applied range', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 1,
            applied: { id: 'r1', kind: 'range', range: 'YTD', at: 1 },
        }));

        await expect(fetchProjectorState()).resolves.toMatchObject({
            applied: { id: 'r1', kind: 'range', range: 'YTD', at: 1 },
        });
    });

    it('fetchProjectorState parses projectorLast and applied', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
            serverTime: 20_000,
            projector: null,
            projectorLast: { mode: 'index', page: 1, v: 3, at: 19_000, stale: true, ageMs: 1000 },
            applied: { id: 'cmd-9', kind: 'layout', density: 'compact', at: 18_500 },
        }));

        await expect(fetchProjectorState()).resolves.toEqual({
            serverTime: 20_000,
            projector: null,
            projectorLast: { mode: 'index', page: 1, v: 3, at: 19_000, stale: true, ageMs: 1000 },
            applied: { id: 'cmd-9', kind: 'layout', density: 'compact', at: 18_500 },
            control: null,
        });
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
