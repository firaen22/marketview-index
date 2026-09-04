import { useEffect, useRef } from 'react';
import type { PresentCommand } from '../../lib/presentCommand';
import { isExecutablePresentCommand, PAGE_COMMAND_FRESH_MS, shouldExecute } from '../../lib/presentCommand';
import { authHeaders } from '../presentCommandApi';

const POLL_MS = 2500;
// A delivered command means the phone remote is in play; 2.5s then dominates
// perceived lag. Drop to 1s for a minute after each hit, then revert. Failure
// backoff still wins while errors continue — a faster retry on a dead socket
// just piles on.
export const FAST_POLL_MS = 1000;
export const ACTIVE_WINDOW_MS = 60_000;
// fetch() has no default timeout: a stalled socket (flaky venue wifi) never
// settles, and since the next poll is only armed after the previous one
// resolves, one hung request would silently end page-turn delivery for the rest
// of the presentation. Abort well past a normal poll so slow-but-alive networks
// still succeed.
const POLL_TIMEOUT_MS = 10000;
const BACKOFF_MS = [5000, 10000, 20000] as const;
const PROJECTOR_MODES = ['slide', 'pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;

export interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
    lid?: string;
}

export function presentCommandBackoffMs(failureCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(failureCount - 1, 0), BACKOFF_MS.length - 1)];
}

// Page commands arrive as a drained queue: delivery consumed them
// server-side, so anything invalid or stale is dropped, never retried.
export function filterFreshPageCommands(value: unknown, serverTime: number): PresentCommand[] {
    return (Array.isArray(value) ? value : [])
        .filter((item): item is PresentCommand => isExecutablePresentCommand(item) && item.kind === 'page')
        .filter(item => item.issuedAt >= serverTime - PAGE_COMMAND_FRESH_MS);
}

export function presentCommandPollUrl(state: ProjectorState | null, ackIds: string[] = []): string {
    if (!state) return '/api/present-command';
    const params = new URLSearchParams();
    params.set('st', '1');
    params.set('mode', state.mode);
    params.set('page', String(state.page));
    params.set('v', String(state.v));
    if (state.lid) params.set('lid', state.lid);
    for (const id of ackIds) params.append('ack', id);
    return `/api/present-command?${params.toString()}`;
}

async function fetchPresentCommand(signal: AbortSignal, state: ProjectorState | null, ackIds: string[]): Promise<{ ok: true; command: PresentCommand | null; pageCommands: PresentCommand[]; serverTime: number } | { ok: false }> {
    try {
        // The key rides along so the server honors the st=1 projector report
        // (state write + page-queue drain are gated on it).
        const response = await fetch(presentCommandPollUrl(state, ackIds), { signal, headers: authHeaders() });
        if (!response.ok) return { ok: false };
        const payload = await response.json() as { command?: unknown; pageCommands?: unknown; serverTime?: unknown };
        // Staleness is judged in server time (issuedAt is server-stamped); a
        // projector clock minutes off must not expire every fresh command.
        const serverTime = typeof payload.serverTime === 'number' && Number.isFinite(payload.serverTime)
            ? payload.serverTime
            : Date.now();
        const pageCommands = filterFreshPageCommands(payload.pageCommands, serverTime);
        if (payload.command === null || payload.command === undefined) return { ok: true, command: null, pageCommands, serverTime };
        if (!isExecutablePresentCommand(payload.command)) return { ok: true, command: null, pageCommands, serverTime };
        return { ok: true, command: payload.command, pageCommands, serverTime };
    } catch (error) {
        if ((error as DOMException).name === 'AbortError') return { ok: false };
        return { ok: false };
    }
}

interface Options {
    enabled: boolean;
    getState?: () => ProjectorState | null;
    // Return false when the command could not be applied yet (e.g. its symbol
    // is not in the still-loading market data) — the id is then NOT locked, so
    // the next poll retries instead of losing the command forever.
    onCommand: (command: PresentCommand) => boolean;
}

export function usePresentCommand({ enabled, getState, onCommand }: Options) {
    const onCommandRef = useRef(onCommand);
    const getStateRef = useRef(getState);
    const lastExecutedIdRef = useRef<string | null>(null);

    useEffect(() => {
        onCommandRef.current = onCommand;
    }, [onCommand]);

    useEffect(() => {
        getStateRef.current = getState;
    }, [getState]);

    useEffect(() => {
        if (!enabled) return;

        let timeout: number | null = null;
        let stopped = false;
        let inFlight = false;
        let failureCount = 0;
        let lastDeliveredAt: number | null = null;
        let controller: AbortController | null = null;
        const pendingPageAckIds: string[] = [];

        const invokeCommand = (command: PresentCommand): boolean => {
            try {
                return onCommandRef.current(command) !== false;
            } catch (error) {
                console.error('Present command callback failed:', error);
                return false;
            }
        };

        const run = async () => {
            // Two overlapping polls can double-execute a page turn on stage;
            // skip rather than start a second in-flight request.
            if (stopped || inFlight) return;
            inFlight = true;
            controller = new AbortController();
            const pollController = controller;
            const timeoutId = window.setTimeout(() => pollController.abort(), POLL_TIMEOUT_MS);
            const state = getStateRef.current?.() ?? null;
            // A null-state poll uses the bare URL, which cannot carry acks — send
            // none so pending ids survive until a projector-state poll transmits them.
            const ackIds = state ? [...pendingPageAckIds] : [];
            try {
                const result = await fetchPresentCommand(pollController.signal, state && lastExecutedIdRef.current ? { ...state, lid: lastExecutedIdRef.current } : state, ackIds);
                if (stopped) return;

                if (result.ok) {
                    for (const id of ackIds) {
                        const index = pendingPageAckIds.indexOf(id);
                        if (index !== -1) pendingPageAckIds.splice(index, 1);
                    }
                    failureCount = 0;
                    let delivered = false;
                    // Page commands execute in tap order and are acknowledged on the
                    // next successful projector poll only after the callback succeeds.
                    for (const pageCommand of result.pageCommands) {
                        if (invokeCommand(pageCommand)) pendingPageAckIds.push(pageCommand.id);
                        delivered = true;
                    }
                    const command = result.command;
                    if (command && shouldExecute(command, lastExecutedIdRef.current, result.serverTime)) {
                        if (invokeCommand(command)) {
                            lastExecutedIdRef.current = command.id;
                        }
                        delivered = true;
                    }
                    if (delivered) lastDeliveredAt = Date.now();
                    const interval = lastDeliveredAt !== null && Date.now() - lastDeliveredAt < ACTIVE_WINDOW_MS
                        ? FAST_POLL_MS
                        : POLL_MS;
                    timeout = window.setTimeout(run, interval);
                    return;
                }

                failureCount += 1;
                timeout = window.setTimeout(run, presentCommandBackoffMs(failureCount));
            } finally {
                window.clearTimeout(timeoutId);
                inFlight = false;
            }
        };

        // Backgrounded tabs throttle timers (often to 10s+); a brief offline
        // gap is the same. On wake, drop the pending interval and poll now —
        // but never overlap an in-flight request (double page-turn on stage).
        const pollNow = () => {
            if (stopped || inFlight) return;
            if (timeout !== null) {
                window.clearTimeout(timeout);
                timeout = null;
            }
            void run();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            pollNow();
        };

        const canSubscribe = typeof document !== 'undefined'
            && typeof document.addEventListener === 'function'
            && typeof window !== 'undefined'
            && typeof window.addEventListener === 'function';
        if (canSubscribe) {
            document.addEventListener('visibilitychange', onVisibilityChange);
            window.addEventListener('online', pollNow);
        }

        void run();

        return () => {
            stopped = true;
            controller?.abort();
            if (timeout !== null) window.clearTimeout(timeout);
            if (canSubscribe) {
                document.removeEventListener('visibilitychange', onVisibilityChange);
                window.removeEventListener('online', pollNow);
            }
        };
    }, [enabled]);
}
