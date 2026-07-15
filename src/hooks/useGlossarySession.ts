import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlossaryLang, GlossarySession } from '../../lib/glossarySession';
import type { JargonTerm } from '../jargon';
import {
    configGlossarySession,
    endGlossarySession,
    fetchGlossarySession,
    GlossaryApiError,
    pushGlossaryTerms,
    reopenGlossarySession,
    startGlossarySession,
    type ClientGlossarySession,
} from '../glossaryApi';

export const GLOSSARY_SESSION_STORAGE_KEY = 'marketflow_glossary_session';
export const GLOSSARY_PUSH_DEBOUNCE_MS = 500;

export interface GlossaryPushPayload {
    code: string;
    page: number;
    lang: GlossaryLang;
    terms: JargonTerm[];
}

export function parseStoredJoinCode(value: string | null): string | null {
    if (!value) return null;
    const raw = value.trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed.trim() || null;
        if (parsed && typeof parsed === 'object' && typeof parsed.joinCode === 'string') {
            return parsed.joinCode.trim() || null;
        }
    } catch {
        return raw;
    }
    return null;
}

export function pushPayloadKey(payload: GlossaryPushPayload): string {
    return JSON.stringify({
        code: payload.code,
        page: payload.page,
        lang: payload.lang,
        terms: payload.terms.map(term => ({
            term: term.term,
            explanation: term.explanation,
        })),
    });
}

export function isDuplicatePushPayload(a: GlossaryPushPayload | null, b: GlossaryPushPayload): boolean {
    return !!a && pushPayloadKey(a) === pushPayloadKey(b);
}

export function shouldSchedulePush(
    next: GlossaryPushPayload,
    lastSent: GlossaryPushPayload | null,
    pending: GlossaryPushPayload | null,
): boolean {
    return !isDuplicatePushPayload(lastSent, next) && !isDuplicatePushPayload(pending, next);
}

export function shouldFlushBeforeReplace(
    pending: GlossaryPushPayload | null,
    next: GlossaryPushPayload,
): boolean {
    if (!pending || pending.terms.length === 0) return false;
    const sameKey = pending.code === next.code && pending.page === next.page && pending.lang === next.lang;
    if (!sameKey) return true;
    const nextTerms = new Set(next.terms.map(term => term.term));
    return !pending.terms.every(term => nextTerms.has(term.term));
}

export function shouldClearStoredSession(status: number | null, session: ClientGlossarySession | null): boolean {
    return status === 404 || session === null;
}

export function shouldRenewForNewDeck(session: ClientGlossarySession | null): boolean {
    if (!session || session.status !== 'live') return false;
    // Terms are keyed to the deck they were read from and the server never
    // deletes one, so a deck swap strands them under the wrong firstPage. Only
    // a session that already carries such content needs retiring — reissuing
    // the QR for an untouched session would make the audience rescan for
    // nothing.
    const termCount = Array.isArray(session.terms) ? session.terms.length : 0;
    const page = Number.isFinite(session.currentPage) ? session.currentPage : 0;
    return termCount > 0 || page > 0;
}

function readStoredJoinCode(): string | null {
    try {
        return parseStoredJoinCode(window.localStorage.getItem(GLOSSARY_SESSION_STORAGE_KEY));
    } catch {
        return null;
    }
}

function writeStoredJoinCode(code: string) {
    try {
        window.localStorage.setItem(GLOSSARY_SESSION_STORAGE_KEY, code);
    } catch {}
}

function clearStoredJoinCode() {
    try {
        window.localStorage.removeItem(GLOSSARY_SESSION_STORAGE_KEY);
    } catch {}
}

export function useGlossarySession() {
    const [session, setSession] = useState<ClientGlossarySession | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const currentPageRef = useRef(0);
    const langRef = useRef<GlossaryLang>('zh-TW');
    const pendingRef = useRef<GlossaryPushPayload | null>(null);
    const lastSentRef = useRef<GlossaryPushPayload | null>(null);
    const debounceRef = useRef<number | null>(null);
    const pushWarnedForRef = useRef<string | null>(null);
    const lastSessionCodeRef = useRef<string | null>(null);
    const startInFlightRef = useRef(false);
    // renew() nulls the session before its awaits, which would otherwise let the
    // mount rehydrate below resurrect the retired session over the new one.
    const renewingRef = useRef(false);
    const sessionRef = useRef<ClientGlossarySession | null>(null);
    const mountedRef = useRef(true);
    const pushEpochRef = useRef(`${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`);
    const pushSeqRef = useRef(0);

    useEffect(() => {
        sessionRef.current = session;
        if (session?.joinCode && lastSessionCodeRef.current !== session.joinCode) {
            lastSessionCodeRef.current = session.joinCode;
            pushWarnedForRef.current = null;
            lastSentRef.current = null;
            pendingRef.current = null;
        }
        if (!session) lastSessionCodeRef.current = null;
    }, [session]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const code = readStoredJoinCode();
        if (!code) return;

        let cancelled = false;
        void (async () => {
            try {
                const loaded = await fetchGlossarySession(code);
                if (cancelled || sessionRef.current || startInFlightRef.current || renewingRef.current) return;
                if (shouldClearStoredSession(null, loaded)) {
                    clearStoredJoinCode();
                    setSession(null);
                    return;
                }
                setSession(loaded);
                currentPageRef.current = loaded?.currentPage ?? 0;
            } catch (caught) {
                if (cancelled || sessionRef.current || startInFlightRef.current || renewingRef.current) return;
                if (caught instanceof GlossaryApiError && (caught.status === 404 || caught.status === 400)) {
                    // 404: expired/deleted. 400: the stored code is corrupt —
                    // clear it too, or every /present load shows an error banner.
                    clearStoredJoinCode();
                    setSession(null);
                    return;
                }
                setError(caught instanceof Error ? caught.message : 'Failed to load glossary session');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => () => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    }, []);

    const flushPush = useCallback(async () => {
        const payload = pendingRef.current;
        pendingRef.current = null;
        if (!payload || isDuplicatePushPayload(lastSentRef.current, payload)) return;
        const seq = pushSeqRef.current + 1;
        pushSeqRef.current = seq;

        try {
            const result = await pushGlossaryTerms(
                payload.code,
                payload.page,
                payload.lang,
                payload.terms,
                { epoch: pushEpochRef.current, seq },
            );
            lastSentRef.current = payload;
            if (seq === pushSeqRef.current && mountedRef.current) {
                setSession(result.session);
                setError(null);
            }
        } catch (caught) {
            if (seq !== pushSeqRef.current) return;
            if (caught instanceof GlossaryApiError && caught.status === 404) {
                clearStoredJoinCode();
                if (mountedRef.current) {
                    setSession(null);
                    setError('Glossary session expired');
                }
                return;
            }
            if (caught instanceof GlossaryApiError && caught.status === 409 && caught.message === 'session_ended') {
                if (mountedRef.current) {
                    setSession(current => current ? { ...current, status: 'ended' } as ClientGlossarySession : current);
                    setError(null);
                }
                return;
            }
            if (pushWarnedForRef.current !== payload.code) {
                console.warn('Glossary session push failed:', caught);
                pushWarnedForRef.current = payload.code;
            }
            if (mountedRef.current) {
                setError(caught instanceof Error ? caught.message : 'Failed to push glossary update');
            }
        }
    }, []);

    const schedulePush = useCallback((payload: GlossaryPushPayload) => {
        if (!shouldSchedulePush(payload, lastSentRef.current, pendingRef.current)) return;
        if (shouldFlushBeforeReplace(pendingRef.current, payload)) {
            if (debounceRef.current !== null) {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
            void flushPush();
        }
        pendingRef.current = payload;
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            void flushPush();
        }, GLOSSARY_PUSH_DEBOUNCE_MS);
    }, [flushPush]);

    const start = useCallback(async (mode: GlossarySession['mode'], keepAfter: boolean) => {
        if (startInFlightRef.current) return;
        startInFlightRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const next = await startGlossarySession(mode, keepAfter);
            if (!mountedRef.current) return;
            setSession(next);
            writeStoredJoinCode(next.joinCode);
            currentPageRef.current = next.currentPage ?? 0;
        } catch (caught) {
            if (mountedRef.current) {
                setError(caught instanceof Error ? caught.message : 'Failed to start glossary session');
            }
        } finally {
            startInFlightRef.current = false;
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    const end = useCallback(async () => {
        const current = sessionRef.current;
        if (!current) return;
        setLoading(true);
        setError(null);
        try {
            await endGlossarySession(current.joinCode);
            let kept = current.keepAfter !== false;
            if (current.keepAfter === undefined) {
                // Rehydrated session: the public view omits keepAfter, so ask
                // the server whether the ended record survived (404 = deleted).
                try {
                    kept = (await fetchGlossarySession(current.joinCode)) !== null;
                } catch {
                    // Transient error — keep showing the ended state locally.
                }
            }
            if (!mountedRef.current) return;
            if (!kept) {
                clearStoredJoinCode();
                setSession(null);
            } else {
                setSession({ ...current, status: 'ended', endedAt: Date.now(), updatedAt: Date.now() } as ClientGlossarySession);
            }
        } catch (caught) {
            if (mountedRef.current) {
                setError(caught instanceof Error ? caught.message : 'Failed to end glossary session');
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    const reopen = useCallback(async () => {
        const current = sessionRef.current;
        if (!current) return;
        setLoading(true);
        setError(null);
        try {
            const next = await reopenGlossarySession(current.joinCode);
            if (!mountedRef.current) return;
            setSession(next);
            writeStoredJoinCode(next.joinCode);
        } catch (caught) {
            if (mountedRef.current) {
                setError(caught instanceof Error ? caught.message : 'Failed to reopen glossary session');
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    const renew = useCallback(async () => {
        const current = sessionRef.current;
        if (!current || !shouldRenewForNewDeck(current)) return;
        if (startInFlightRef.current) return;

        // Retire the outgoing session BEFORE the first await, or the two
        // round-trips below leave a window in which the old deck still looks
        // live: reportPage/reportTerms would re-arm a push against the retired
        // join code, and any push already awaiting would resolve into
        // flushPush's `seq === pushSeqRef.current` branch and setSession() the
        // dead session back over the new one — putting a dead QR on the
        // projector. Bumping the seq invalidates those in-flight pushes (every
        // flushPush branch checks it) and nulling the session makes the report
        // callbacks early-return for the whole window.
        renewingRef.current = true;
        pushSeqRef.current += 1;
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        pendingRef.current = null;
        lastSentRef.current = null;
        currentPageRef.current = 0;
        sessionRef.current = null;
        setSession(null);
        clearStoredJoinCode();

        setLoading(true);
        setError(null);
        try {
            try {
                await endGlossarySession(current.joinCode);
            } catch {
                // The outgoing session is abandoned either way — if the end call
                // fails it just expires on its TTL. Never block the new QR on it.
            }
            if (!mountedRef.current) return;
            // Carry the presenter's mode/keepAfter choices across; a rehydrated
            // session omits keepAfter, so treat unknown as the server default.
            await start(current.mode, current.keepAfter !== false);
        } finally {
            renewingRef.current = false;
        }
    }, [start]);

    const setMode = useCallback(async (mode: GlossarySession['mode']) => {
        const current = sessionRef.current;
        if (!current || current.mode === mode) return;
        setSession({ ...current, mode });
        try {
            const next = await configGlossarySession(current.joinCode, { mode });
            if (mountedRef.current) {
                setSession(next);
                setError(null);
            }
        } catch (caught) {
            if (mountedRef.current) {
                setSession(current);
                setError(caught instanceof Error ? caught.message : 'Failed to update glossary mode');
            }
        }
    }, []);

    const reportPage = useCallback((page: number) => {
        const current = sessionRef.current;
        if (!current || current.status !== 'live' || !Number.isInteger(page) || page < 1) return;
        currentPageRef.current = page;
        schedulePush({ code: current.joinCode, page, lang: langRef.current, terms: [] });
    }, [schedulePush]);

    const reportTerms = useCallback((terms: JargonTerm[], lang: GlossaryLang) => {
        const current = sessionRef.current;
        const page = currentPageRef.current;
        langRef.current = lang;
        if (!current || current.status !== 'live' || !Number.isInteger(page) || page < 1) return;
        schedulePush({ code: current.joinCode, page, lang, terms });
    }, [schedulePush]);

    return {
        session,
        loading,
        error,
        start,
        end,
        reopen,
        renew,
        setMode,
        reportPage,
        reportTerms,
    };
}

export type UseGlossarySessionResult = ReturnType<typeof useGlossarySession>;
