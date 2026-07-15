import { useEffect, useRef } from 'react';
import type { PresentCommand } from '../../lib/presentCommand';
import { isExecutablePresentCommand, shouldExecute } from '../../lib/presentCommand';

const POLL_MS = 2500;
const BACKOFF_MS = [5000, 10000, 20000] as const;

export function presentCommandBackoffMs(failureCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(failureCount - 1, 0), BACKOFF_MS.length - 1)];
}

async function fetchPresentCommand(signal: AbortSignal): Promise<{ ok: true; command: PresentCommand | null } | { ok: false }> {
    try {
        const response = await fetch('/api/present-command', { signal });
        if (!response.ok) return { ok: false };
        const payload = await response.json() as { command?: unknown };
        if (payload.command === null || payload.command === undefined) return { ok: true, command: null };
        if (!isExecutablePresentCommand(payload.command)) return { ok: true, command: null };
        return { ok: true, command: payload.command };
    } catch (error) {
        if ((error as DOMException).name === 'AbortError') return { ok: false };
        return { ok: false };
    }
}

interface Options {
    enabled: boolean;
    onCommand: (command: PresentCommand) => void;
}

export function usePresentCommand({ enabled, onCommand }: Options) {
    const onCommandRef = useRef(onCommand);
    const lastExecutedIdRef = useRef<string | null>(null);

    useEffect(() => {
        onCommandRef.current = onCommand;
    }, [onCommand]);

    useEffect(() => {
        if (!enabled) return;

        let timeout: number | null = null;
        let stopped = false;
        let failureCount = 0;
        let controller: AbortController | null = null;

        const run = async () => {
            controller = new AbortController();
            const result = await fetchPresentCommand(controller.signal);
            if (stopped) return;

            if (result.ok) {
                failureCount = 0;
                const command = result.command;
                if (command && shouldExecute(command, lastExecutedIdRef.current, Date.now())) {
                    lastExecutedIdRef.current = command.id;
                    onCommandRef.current(command);
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
