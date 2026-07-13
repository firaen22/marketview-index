import { useEffect, useMemo, useRef, useState } from 'react';
import type { GlossaryTermSnapshot } from '../../lib/glossarySession';

export interface AudienceSessionView {
    status: 'live' | 'ended';
    mode: 'all' | 'gradual';
    currentPage: number;
    termCount: number;
    joins: number;
    updatedAt: number;
    terms: GlossaryTermSnapshot[];
}

export type PollStatus = 'idle' | 'loading' | 'ready' | 'invalid' | 'not_found' | 'rate_limited' | 'error';

export interface GlossaryPollState {
    status: PollStatus;
    session: AudienceSessionView | null;
    reconnecting: boolean;
    failureCount: number;
    error: string | null;
}

export interface PollResult {
    type: 'success' | 'network_error' | 'not_found' | 'rate_limited' | 'invalid' | 'server_error';
    session?: AudienceSessionView;
    message?: string;
}

// Duplicates JOIN_CODE_PATTERN in lib/glossarySession.ts (kept in sync by
// hand) so the audience chunk never pulls in that module's Node crypto import.
const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;
const POLL_MS = 5000;
const RATE_LIMIT_MS = 10000;
const BACKOFF_MS = [5000, 10000, 20000] as const;

export function normalizeAudienceCode(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const code = input.trim().toUpperCase();
    return JOIN_CODE_PATTERN.test(code) ? code : null;
}

export function reconnectDelayMs(failureCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(failureCount - 1, 0), BACKOFF_MS.length - 1)];
}

export function nextPollDelayMs(result: PollResult, state: GlossaryPollState): number | null {
    if (result.type === 'success') {
        return result.session?.status === 'live' ? POLL_MS : null;
    }
    if (result.type === 'rate_limited') return RATE_LIMIT_MS;
    if (result.type === 'network_error' || result.type === 'server_error') {
        return reconnectDelayMs(state.failureCount);
    }
    return null;
}

export function reducePollState(state: GlossaryPollState, result: PollResult): GlossaryPollState {
    if (result.type === 'success' && result.session) {
        return {
            status: 'ready',
            session: result.session,
            reconnecting: false,
            failureCount: 0,
            error: null,
        };
    }

    if (result.type === 'not_found') {
        return {
            status: 'not_found',
            session: state.session,
            reconnecting: false,
            failureCount: 0,
            error: 'not_found',
        };
    }

    if (result.type === 'rate_limited') {
        return {
            ...state,
            status: state.session ? 'ready' : 'rate_limited',
            reconnecting: true,
            error: 'rate_limited',
        };
    }

    if (result.type === 'invalid') {
        return {
            status: 'invalid',
            session: null,
            reconnecting: false,
            failureCount: 0,
            error: 'invalid_code',
        };
    }

    return {
        ...state,
        status: state.session ? 'ready' : 'error',
        reconnecting: true,
        failureCount: state.failureCount + 1,
        error: result.message ?? 'network_error',
    };
}

async function fetchSession(code: string, signal: AbortSignal): Promise<PollResult> {
    try {
        const response = await fetch(`/api/glossary-session?code=${encodeURIComponent(code)}`, { signal });
        if (response.status === 404) return { type: 'not_found' };
        if (response.status === 429) return { type: 'rate_limited' };
        if (!response.ok) return { type: 'server_error', message: `http_${response.status}` };
        const payload = await response.json() as { session?: AudienceSessionView };
        if (!payload.session) return { type: 'server_error', message: 'missing_session' };
        return { type: 'success', session: payload.session };
    } catch (error) {
        if ((error as DOMException).name === 'AbortError') return { type: 'server_error', message: 'aborted' };
        return { type: 'network_error' };
    }
}

function joinFlagKey(code: string): string {
    return `marketflow_glossary_joined_${code}`;
}

function fireJoinBeacon(code: string) {
    try {
        if (localStorage.getItem(joinFlagKey(code))) return;
        localStorage.setItem(joinFlagKey(code), '1');
    } catch {
        // localStorage is only a client-side dedupe hint. If it is unavailable,
        // still attempt the beacon once for this mount.
    }

    fetch('/api/glossary-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', code }),
        keepalive: true,
    }).catch(() => undefined);
}

export function useGlossaryPoll(rawCode: string | undefined) {
    const code = useMemo(() => normalizeAudienceCode(rawCode), [rawCode]);
    const [state, setState] = useState<GlossaryPollState>(() => ({
        status: code ? 'loading' : 'invalid',
        session: null,
        reconnecting: false,
        failureCount: 0,
        error: code ? null : 'invalid_code',
    }));
    const stateRef = useRef(state);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (!code) {
            setState({
                status: 'invalid',
                session: null,
                reconnecting: false,
                failureCount: 0,
                error: 'invalid_code',
            });
            return;
        }

        fireJoinBeacon(code);
        const controller = new AbortController();
        let timeout: number | null = null;
        let stopped = false;

        const run = async () => {
            const result = await fetchSession(code, controller.signal);
            if (stopped) return;
            // Derive the next state here, not inside the setState updater: the
            // updater runs asynchronously, so reading its output for the delay
            // would use stale state and lag the backoff by one failure.
            const nextState = reducePollState(stateRef.current, result);
            stateRef.current = nextState;
            setState(nextState);

            const delay = nextPollDelayMs(result, nextState);
            if (delay !== null) {
                timeout = window.setTimeout(run, delay);
            }
        };

        setState(current => ({
            status: current.session ? 'ready' : 'loading',
            session: current.session,
            reconnecting: false,
            failureCount: 0,
            error: null,
        }));
        void run();

        return () => {
            stopped = true;
            controller.abort();
            if (timeout !== null) window.clearTimeout(timeout);
        };
    }, [code]);

    return { code, ...state };
}
