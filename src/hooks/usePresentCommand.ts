import { useEffect, useRef } from 'react';
import type { PresentCommand } from '../../lib/presentCommand';
import { isExecutablePresentCommand, PAGE_COMMAND_FRESH_MS, shouldExecute } from '../../lib/presentCommand';
import { appendProjectorDisplayParams, type ProjectorDisplay } from '../../lib/presentDisplay';
import { authHeaders } from '../presentCommandApi';

/** Idle projector poll interval (ms). In-talk cadence uses {@link FAST_POLL_MS}. */
export const POLL_MS = 1800;
export const FAST_POLL_MS = 1000;
export const ACTIVE_WINDOW_MS = 60_000;
/** One stateful follow-up poll after a slot execute so the server gets `lid` without waiting a full FAST/idle tick. */
export const LID_FLUSH_MS = 50;
const MAX_FLUSH_NULL_STATE_TICKS = 20;

// Shared-NAT GET budget: ~60 FAST + ~15 assist + ~5 control display ≈ 80/min before
// optional +1 flush per slot execute (see docs/present-latency-fix-plan.md). Do not cut
// FAST_POLL_MS to 600 — that alone exceeds RATE_LIMIT_MAX 90/min in-talk.
//
// 2026-10-23 dry-run (marketindex.pmd-hk.com): ack 2.1–3.6 s was dominated by sending
// `lid` on poll N+1 after FAST_POLL_MS. P0 adds a single coalesced LID_FLUSH_MS poll
// after each successful stateful slot execute when getState() is available.
const POLL_TIMEOUT_MS = 10000;
const BACKOFF_MS = [5000, 10000, 20000] as const;
const PROJECTOR_MODES = ['slide', 'pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;

export interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
    lid?: string;
    display?: ProjectorDisplay;
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
    appendProjectorDisplayParams(params, state.display);
    for (const id of ackIds) params.append('ack', id);
    return `/api/present-command?${params.toString()}`;
}

async function fetchPresentCommand(signal: AbortSignal, state: ProjectorState | null, ackIds: string[]): Promise<{ ok: true; command: PresentCommand | null; pageCommands: PresentCommand[]; serverTime: number } | { ok: false }> {
    try {
        const response = await fetch(presentCommandPollUrl(state, ackIds), { signal, headers: authHeaders() });
        if (!response.ok) return { ok: false };
        const payload = await response.json() as { command?: unknown; pageCommands?: unknown; serverTime?: unknown };
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
    onCommand: (command: PresentCommand) => boolean;
}

type PollKind = 'normal' | 'lid-flush';

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
        let nextPollKind: PollKind = 'normal';
        let flushNullStateTicks = 0;

        const clearScheduledPoll = () => {
            if (timeout !== null) {
                window.clearTimeout(timeout);
                timeout = null;
            }
        };

        const schedulePoll = (delayMs: number, kind: PollKind = 'normal') => {
            clearScheduledPoll();
            nextPollKind = kind;
            timeout = window.setTimeout(run, delayMs);
        };

        const cadenceInterval = () => (
            lastDeliveredAt !== null && Date.now() - lastDeliveredAt < ACTIVE_WINDOW_MS
                ? FAST_POLL_MS
                : POLL_MS
        );

        const invokeCommand = (command: PresentCommand): boolean => {
            try {
                return onCommandRef.current(command) !== false;
            } catch (error) {
                console.error('Present command callback failed:', error);
                return false;
            }
        };

        const run = async () => {
            if (stopped || inFlight) return;
            inFlight = true;
            controller = new AbortController();
            const pollController = controller;
            const timeoutId = window.setTimeout(() => pollController.abort(), POLL_TIMEOUT_MS);
            const pollKind = nextPollKind;
            nextPollKind = 'normal';

            try {
                let state = getStateRef.current?.() ?? null;

                if (pollKind === 'lid-flush' && !state) {
                    flushNullStateTicks += 1;
                    if (flushNullStateTicks >= MAX_FLUSH_NULL_STATE_TICKS) {
                        flushNullStateTicks = 0;
                        schedulePoll(cadenceInterval(), 'normal');
                    } else {
                        schedulePoll(LID_FLUSH_MS, 'lid-flush');
                    }
                    return;
                }

                if (pollKind === 'lid-flush') {
                    flushNullStateTicks = 0;
                }

                const requestWasStateful = state !== null;
                const ackIds = state ? [...pendingPageAckIds] : [];
                const fetchState = state && lastExecutedIdRef.current
                    ? { ...state, lid: lastExecutedIdRef.current }
                    : state;

                const result = await fetchPresentCommand(pollController.signal, fetchState, ackIds);
                if (stopped) return;

                if (result.ok) {
                    for (const id of ackIds) {
                        const index = pendingPageAckIds.indexOf(id);
                        if (index !== -1) pendingPageAckIds.splice(index, 1);
                    }
                    failureCount = 0;
                    let delivered = false;
                    let armLidFlush = false;

                    for (const pageCommand of result.pageCommands) {
                        if (invokeCommand(pageCommand)) pendingPageAckIds.push(pageCommand.id);
                        delivered = true;
                    }

                    const command = result.command;
                    if (command && shouldExecute(command, lastExecutedIdRef.current, result.serverTime)) {
                        if (invokeCommand(command)) {
                            lastExecutedIdRef.current = command.id;
                            if (requestWasStateful) armLidFlush = true;
                        }
                        delivered = true;
                    }

                    if (delivered) lastDeliveredAt = Date.now();

                    if (armLidFlush) {
                        schedulePoll(LID_FLUSH_MS, 'lid-flush');
                    } else {
                        schedulePoll(cadenceInterval(), 'normal');
                    }
                    return;
                }

                failureCount += 1;
                schedulePoll(presentCommandBackoffMs(failureCount), 'normal');
            } finally {
                window.clearTimeout(timeoutId);
                inFlight = false;
            }
        };

        const pollNow = () => {
            if (stopped || inFlight) return;
            clearScheduledPoll();
            // Wake must not resurrect a pending lid-flush arm (T12): run one normal poll;
            // stateful wake still sends lid via lastExecutedIdRef merge.
            nextPollKind = 'normal';
            flushNullStateTicks = 0;
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
            clearScheduledPoll();
            if (canSubscribe) {
                document.removeEventListener('visibilitychange', onVisibilityChange);
                window.removeEventListener('online', pollNow);
            }
        };
    }, [enabled]);
}
