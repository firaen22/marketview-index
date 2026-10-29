import type { PresentCommand } from '../../lib/presentCommand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../presentCommandApi', () => ({
    authHeaders: () => ({}),
}));

const { ACTIVE_WINDOW_MS, FAST_POLL_MS, LID_FLUSH_MS, POLL_MS, presentCommandPollUrl, usePresentCommand } = await import('./usePresentCommand');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function Harness({
    onCommand,
    getState,
}: {
    onCommand: (command: PresentCommand) => boolean;
    getState?: () => import('./usePresentCommand').ProjectorState | null;
}) {
    usePresentCommand({ enabled: true, onCommand, getState });
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
    const IDLE_POLL_MS = POLL_MS;

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

    it('schedules a lid flush 50 ms after a stateful slot execute, then FAST polling', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(LID_FLUSH_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const flushUrl = String(fetchMock.mock.calls[1]?.[0]);
        expect(flushUrl).toContain('lid=cmd-1');
        expect(flushUrl).toBe(presentCommandPollUrl({ ...projectorState, lid: 'cmd-1' }));

        await advance(FAST_POLL_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not re-execute the same slot id on the lid-flush poll', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        let executes = 0;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => {
                    executes += 1;
                    return true;
                },
                getState: () => projectorState,
            }));
        });
        await flush();
        await advance(LID_FLUSH_MS);
        expect(executes).toBe(1);
    });

    it('does not arm a lid flush when onCommand returns false', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        let executes = 0;
        let rejectedOnce = false;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValueOnce(okResponse())
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }));
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: (command) => {
                    if (command.id === 'cmd-1' && !rejectedOnce) {
                        rejectedOnce = true;
                        return false;
                    }
                    executes += 1;
                    return true;
                },
                getState: () => projectorState,
            }));
        });
        await flush();
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(FAST_POLL_MS - LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('lid=cmd-1');
        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(executes).toBe(1);
    });

    it('does not fetch after unmount during a pending lid flush', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        await act(async () => {
            root.unmount();
        });
        await advance(LID_FLUSH_MS + FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        root = createRoot(container);
    });

    it('page-only delivery does not arm a lid flush at 50 ms', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ pageCommands: [pageCommand('page-1')] }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('lid=');
    });

    it('visibility wake during a pending lid flush runs one normal poll immediately', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('visible');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        visibility.mockRestore();
    });

    it('flush URL includes lid and pending page ack', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({
                pageCommands: [pageCommand('page-1')],
                command: slotCommand('cmd-1'),
            }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        await advance(LID_FLUSH_MS);
        const flushUrl = String(fetchMock.mock.calls[1]?.[0]);
        expect(flushUrl).toContain('lid=cmd-1');
        expect(flushUrl).toContain('ack=page-1');
    });

    it('failed lid flush uses backoff then resends lid on recovery', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({
                pageCommands: [pageCommand('page-1')],
                command: slotCommand('cmd-1'),
            }))
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(5000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const recoveryUrl = String(fetchMock.mock.calls[2]?.[0]);
        expect(recoveryUrl).toContain('lid=cmd-1');
        expect(recoveryUrl).toContain('ack=page-1');
    });

    it('stops null-state flush reschedule after 20 ticks and uses normal cadence', async () => {
        let state: import('./usePresentCommand').ProjectorState | null = { mode: 'index', page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => state,
            }));
        });
        await flush();
        state = null;
        for (let i = 0; i < 20; i += 1) {
            await advance(LID_FLUSH_MS);
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(FAST_POLL_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('lid=');
        state = { mode: 'index', page: 1, v: 0 };
        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain('lid=cmd-1');
    });

    it('bare slot latch sends lid on the next stateful poll without a 50 ms flush', async () => {
        let state: import('./usePresentCommand').ProjectorState | null = null;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValueOnce(okResponse())
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => state,
            }));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        state = { mode: 'index', page: 1, v: 0 };
        await advance(FAST_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain('lid=cmd-1');
    });

    it('reschedules lid flush when getState is null at flush time without fetching', async () => {
        let state: import('./usePresentCommand').ProjectorState | null = { mode: 'index', page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => state,
            }));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        state = null;
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        state = { mode: 'index', page: 1, v: 0 };
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain('lid=cmd-1');
    });

    it('coalesces to one lid flush with the latest id when a second slot latches before flush', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-2') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => true,
                getState: () => projectorState,
            }));
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await advance(LID_FLUSH_MS / 2);
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        visibility.mockReturnValue('visible');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        visibility.mockRestore();
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await advance(LID_FLUSH_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain('lid=cmd-2');
        expect(String(fetchMock.mock.calls[2]?.[0])).not.toContain('lid=cmd-1');
    });

    it('executes a new slot returned on the lid-flush poll and rearms one flush', async () => {
        const projectorState = { mode: 'index' as const, page: 1, v: 0 };
        let executes = 0;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-1') }))
            .mockResolvedValueOnce(okResponse({ command: slotCommand('cmd-2') }))
            .mockResolvedValue(okResponse());
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, {
                onCommand: () => {
                    executes += 1;
                    return true;
                },
                getState: () => projectorState,
            }));
        });
        await flush();
        expect(executes).toBe(1);
        await advance(LID_FLUSH_MS);
        expect(executes).toBe(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await advance(LID_FLUSH_MS);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[2]?.[0])).toContain('lid=cmd-2');
    });

    it('returns to idle polling 60 s after the last delivered command', async () => {
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

        // Mid-interval: a cancelled timer must not fire at the original idle mark.
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

        await advance(POLL_MS);
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

        await advance(POLL_MS);
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

        await advance(5000);
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
