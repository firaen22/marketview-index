import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAssist, fetchProjectorState, PresentCommandApiError } from './presentCommandApi';

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
