// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../presentCommandApi', () => ({
    authHeaders: () => ({}),
}));

const { ACTIVE_WINDOW_MS, FAST_POLL_MS, usePresentCommand } = await import('./usePresentCommand');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function Harness({ onCommand }: { onCommand: () => boolean }) {
    usePresentCommand({ enabled: true, onCommand });
    return null;
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

describe('usePresentCommand polling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('recovers when a poll request hangs instead of stalling page delivery forever', async () => {
        // A stalled socket: fetch never settles and never rejects.
        const aborted: boolean[] = [];
        const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                aborted.push(true);
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
        }));
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, { onCommand: () => true }));
        });
        await flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Well past a normal poll: without a request timeout nothing happens,
        // because the next poll is only armed after the previous one resolves.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(9000);
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Cross the 10s poll timeout: the hung request is aborted...
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await flush();
        expect(aborted.length).toBeGreaterThan(0);

        // ...and the backoff re-arms the loop, so delivery resumes.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });
        await flush();
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    const SERVER_TIME = 1_000_000;
    const IDLE_POLL_MS = 2500;

    function okResponse(payload: { command?: unknown; pageCommands?: unknown } = {}) {
        return {
            ok: true,
            json: async () => ({
                command: payload.command ?? null,
                pageCommands: payload.pageCommands ?? [],
                serverTime: SERVER_TIME,
            }),
        };
    }

    function slotCommand(id: string) {
        return { v: 1 as const, id, kind: 'clear' as const, symbols: [] as string[], issuedAt: SERVER_TIME };
    }

    function pageCommand(id: string) {
        return { v: 1 as const, id, kind: 'page' as const, symbols: [] as string[], direction: 'next' as const, issuedAt: SERVER_TIME };
    }

    async function renderHook() {
        await act(async () => {
            root.render(createElement(Harness, { onCommand: () => true }));
        });
        await flush();
    }

    async function advance(ms: number) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(ms);
        });
        await flush();
    }

    it('polls at 1000 ms after a delivered slot command, not 2500', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(FAST_POLL_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns to 2500 ms polling 60 s after the last delivered command', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        for (let elapsed = FAST_POLL_MS; elapsed <= ACTIVE_WINDOW_MS; elapsed += FAST_POLL_MS) {
            await advance(FAST_POLL_MS);
        }
        const callsAtWindowEnd = fetchMock.mock.calls.length;

        await advance(FAST_POLL_MS);
        expect(fetchMock.mock.calls.length).toBe(callsAtWindowEnd);

        await advance(IDLE_POLL_MS - FAST_POLL_MS);
        expect(fetchMock.mock.calls.length).toBe(callsAtWindowEnd + 1);
    });

    it('visibilitychange to visible fetches immediately and cancels the pending timer', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Mid-interval: a cancelled timer must not fire at the original 2500 mark.
        await advance(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('visible');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        visibility.mockRestore();

        await advance(1500);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(1000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('online event fetches immediately and cancels the pending timer', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await advance(1500);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(1000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('a visibility event while a fetch is in flight does not start a second fetch', async () => {
        const fetchMock = vi.fn(() => new Promise(() => { /* hang */ }));
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('visible');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        visibility.mockRestore();
    });

    it('visibilitychange to hidden does not poll', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('hidden');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        visibility.mockRestore();
    });

    it('failure backoff takes precedence over the fast interval', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue({ ok: false });
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(5000 - FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('a delivered page command also starts the fast poll window', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ pageCommands: [pageCommand('page-1')] }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not schedule after unmount during an in-flight wake poll', async () => {
        let resolveFetch: ((value: unknown) => void) | undefined;
        const fetchMock = vi.fn(() => new Promise(resolve => {
            resolveFetch = resolve;
        }));
        vi.stubGlobal('fetch', fetchMock);

        await renderHook();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('visible');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        visibility.mockRestore();

        await act(async () => {
            root.unmount();
        });
        await act(async () => {
            resolveFetch?.(okResponse());
        });
        await flush();
        await advance(20000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        root = createRoot(container);
    });
});
