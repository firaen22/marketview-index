import { useEffect, useRef } from 'react';
import type { PresentCommand } from '../../lib/presentCommand';
import { isExecutablePresentCommand, shouldExecute } from '../../lib/presentCommand';

const POLL_MS = 2500;
const BACKOFF_MS = [5000, 10000, 20000] as const;
const PROJECTOR_MODES = ['pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;

export interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
}

export function presentCommandBackoffMs(failureCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(failureCount - 1, 0), BACKOFF_MS.length - 1)];
}

export function presentCommandPollUrl(state: ProjectorState | null): string {
    if (!state) return '/api/present-command';
    const params = new URLSearchParams();
    params.set('st', '1');
    params.set('mode', state.mode);
    params.set('page', String(state.page));
    params.set('v', String(state.v));
    return `/api/present-command?${params.toString()}`;
}

async function fetchPresentCommand(signal: AbortSignal, state: ProjectorState | null): Promise<{ ok: true; command: PresentCommand | null; serverTime: number } | { ok: false }> {
    try {
        const response = await fetch(presentCommandPollUrl(state), { signal });
        if (!response.ok) return { ok: false };
        const payload = await response.json() as { command?: unknown; serverTime?: unknown };
        // Staleness is judged in server time (issuedAt is server-stamped); a
        // projector clock minutes off must not expire every fresh command.
        const serverTime = typeof payload.serverTime === 'number' && Number.isFinite(payload.serverTime)
            ? payload.serverTime
            : Date.now();
        if (payload.command === null || payload.command === undefined) return { ok: true, command: null, serverTime };
        if (!isExecutablePresentCommand(payload.command)) return { ok: true, command: null, serverTime };
        return { ok: true, command: payload.command, serverTime };
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
        let failureCount = 0;
        let controller: AbortController | null = null;

        const run = async () => {
            controller = new AbortController();
            const result = await fetchPresentCommand(controller.signal, getStateRef.current?.() ?? null);
            if (stopped) return;

            if (result.ok) {
                failureCount = 0;
                const command = result.command;
                if (command && shouldExecute(command, lastExecutedIdRef.current, result.serverTime)) {
                    if (onCommandRef.current(command) !== false) {
                        lastExecutedIdRef.current = command.id;
                    }
                }
                timeout = window.setTimeout(run, POLL_MS);
                return;
            }

            failureCount += 1;
            timeout = window.setTimeout(run, presentCommandBackoffMs(failureCount));
        };

        void run();

        return () => {
            stopped = true;
            controller?.abort();
            if (timeout !== null) window.clearTimeout(timeout);
        };
    }, [enabled]);
}
