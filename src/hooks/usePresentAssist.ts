import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistResult } from '../../lib/presentAssist';
import { ASSIST_MAX_TEXT_LEN, ASSIST_MIN_TEXT_LEN, normalizeAssistText } from '../../lib/presentAssist';
import type { PresentSlide } from '../settings';
import { fetchAssist, fetchAssistImage, fetchProjectorState, type ProjectorState } from '../presentCommandApi';
import { extractPdfPageText, loadPdf, renderPdfPageToJpeg } from '../pdfText';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const POLL_MS = 4000;
const LIVE_MS = 15_000;
const BACKOFF_MS = [8000, 16000, 32000] as const;
const ASSIST_DEBOUNCE_MS = 800;
const ASSIST_TIMEOUT_MS = 45_000;
const ASSIST_IMAGE_TIMEOUT_MS = 60_000;

export type AssistStatus = 'idle' | 'loading' | 'syncing' | 'ready' | 'notext' | 'unsupported' | 'offdeck' | 'error';

interface Options {
    slide: PresentSlide;
    lang: 'en' | 'zh-TW';
    enabled: boolean;
}

export interface PresentAssistState {
    status: AssistStatus;
    assist: AssistResult | null;
    page: number;
    numPages: number;
    live: boolean;
    retry: () => void;
    prevManualPage: () => void;
    nextManualPage: () => void;
    prepare: {
        status: 'idle' | 'preparing' | 'cancelled' | 'done';
        done: number;
        total: number;
        failed: number[];
        start: () => void;
        cancel: () => void;
    };
}

interface TextTarget {
    kind: 'text';
    mode: 'pdf' | 'markdown' | 'html';
    page: number;
    text: string;
}

interface ImageTarget {
    kind: 'image';
    mode: 'pdf';
    page: number;
    imageBase64: string;
    slideId: string;
    deckKey: string;
}

type Target = TextTarget | ImageTarget;

export function presentAssistBackoffMs(failureCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(failureCount - 1, 0), BACKOFF_MS.length - 1)];
}

export function prepareAssistRequestText(text: string): string {
    return text.trim().slice(0, ASSIST_MAX_TEXT_LEN);
}

function assistCacheKey(slideUpdatedAt: number, target: Target, lang: 'en' | 'zh-TW'): string {
    return `${slideUpdatedAt}#${target.mode}#${target.page}#${target.kind}#${lang}`;
}

async function fetchTargetAssist(target: Target, lang: 'en' | 'zh-TW', signal: AbortSignal): Promise<AssistResult> {
    return target.kind === 'text'
        ? fetchAssist(prepareAssistRequestText(target.text), lang, signal)
        : fetchAssistImage(target.imageBase64, target.slideId, target.deckKey, lang, signal);
}

// Normalized length, matching the server's check: whitespace padding must not
// let effectively-empty text through to a wasted NIM call.
export function isAssistTextEligible(text: string): boolean {
    return normalizeAssistText(text).length >= ASSIST_MIN_TEXT_LEN;
}

function isLiveProjector(projector: ProjectorState | null, serverTime: number): projector is ProjectorState {
    return !!projector && serverTime - projector.at <= LIVE_MS;
}

export function usePresentAssist({ slide, lang, enabled }: Options): PresentAssistState {
    const [status, setStatus] = useState<AssistStatus>(enabled ? 'loading' : 'idle');
    const [assist, setAssist] = useState<AssistResult | null>(null);
    const [projector, setProjector] = useState<ProjectorState | null>(null);
    const [serverTime, setServerTime] = useState(() => Date.now());
    const [manualPage, setManualPage] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [retryNonce, setRetryNonce] = useState(0);
    const [prepareState, setPrepareState] = useState<{
        status: 'idle' | 'preparing' | 'cancelled' | 'done';
        done: number;
        total: number;
        failed: number[];
    }>({ status: 'idle', done: 0, total: 0, failed: [] });
    const cacheRef = useRef(new Map<string, AssistResult>());
    const activeRequestKeyRef = useRef<string | null>(null);
    const assistControllerRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<number | null>(null);
    const pdfRef = useRef<{ url: string; doc: PDFDocumentProxy } | null>(null);
    const loadKeyRef = useRef(0);
    const lastLivePdfPageRef = useRef(1);
    const wasLiveRef = useRef(false);
    const projectorRef = useRef<ProjectorState | null>(null);
    const lastPollSuccessRef = useRef<{ serverTime: number; localAt: number } | null>(null);
    const retryBypassDebounceRef = useRef(false);
    const prepareStatusRef = useRef(prepareState.status);
    const prepareRunRef = useRef<{ cancelled: boolean; controller: AbortController | null } | null>(null);

    useEffect(() => {
        prepareStatusRef.current = prepareState.status;
    }, [prepareState.status]);

    const live = isLiveProjector(projector, serverTime);
    const rawPage = live && projector.mode === 'pdf' ? projector.page : manualPage;
    const page = numPages > 0 ? Math.max(1, Math.min(numPages, rawPage)) : rawPage;
    // Primitive target signature: the assist effect must re-run ONLY when
    // these change, not on every 4s poll (projector/serverTime get fresh
    // identities each poll; re-running per poll would abort every in-flight
    // assist request before the ~6s generation can finish).
    const liveMode = live ? projector.mode : null;
    // Any live CONTENT mode out of version-sync must re-trigger the effect so
    // resolveTarget can report 'syncing' (matches the uniform v gate inside).
    const syncing = live
        && (projector.mode === 'pdf' || projector.mode === 'markdown' || projector.mode === 'html')
        && projector.v !== slide.updatedAt;

    const clearAssistRequest = useCallback(() => {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        assistControllerRef.current?.abort();
        assistControllerRef.current = null;
        activeRequestKeyRef.current = null;
    }, []);

    useEffect(() => {
        if (!enabled) {
            setStatus('idle');
            setAssist(null);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        let timeout: number | null = null;
        let stopped = false;
        let failureCount = 0;
        let controller: AbortController | null = null;

        const run = async () => {
            controller = new AbortController();
            try {
                const result = await fetchProjectorState(controller.signal);
                if (stopped) return;
                failureCount = 0;
                lastPollSuccessRef.current = { serverTime: result.serverTime, localAt: Date.now() };
                const nextLive = isLiveProjector(result.projector, result.serverTime);
                if (nextLive && result.projector.mode === 'pdf') {
                    lastLivePdfPageRef.current = result.projector.page;
                }
                if (!nextLive && wasLiveRef.current) {
                    setManualPage(Math.max(1, lastLivePdfPageRef.current));
                }
                wasLiveRef.current = nextLive;
                projectorRef.current = result.projector;
                setProjector(result.projector);
                setServerTime(result.serverTime);
                timeout = window.setTimeout(run, POLL_MS);
            } catch (error) {
                if (stopped || (error as DOMException).name === 'AbortError') return;
                failureCount += 1;
                // A single failed poll must not drop live mode while the last
                // reported state is still within its 15s TTL — estimate server
                // time by local elapsed-since-last-success (a skew-free delta)
                // and let live-ness decay naturally.
                const last = lastPollSuccessRef.current;
                const estimatedServerTime = last
                    ? last.serverTime + (Date.now() - last.localAt)
                    : Date.now();
                const nextLive = isLiveProjector(projectorRef.current, estimatedServerTime);
                if (!nextLive && wasLiveRef.current) {
                    setManualPage(Math.max(1, lastLivePdfPageRef.current));
                }
                wasLiveRef.current = nextLive;
                setServerTime(estimatedServerTime);
                timeout = window.setTimeout(run, presentAssistBackoffMs(failureCount));
            }
        };

        void run();

        return () => {
            stopped = true;
            controller?.abort();
            if (timeout !== null) window.clearTimeout(timeout);
        };
    }, [enabled]);

    useEffect(() => {
        return () => {
            clearAssistRequest();
            // Invalidate any in-flight loadPdf so its late resolution destroys
            // the document instead of leaking it into an unmounted hook.
            loadKeyRef.current += 1;
            pdfRef.current?.doc.destroy();
            pdfRef.current = null;
        };
    }, [clearAssistRequest]);

    useEffect(() => {
        if (slide.mode !== 'pdf' || pdfRef.current?.url !== slide.content) {
            pdfRef.current?.doc.destroy();
            pdfRef.current = null;
            setNumPages(0);
        }
    }, [slide.mode, slide.content]);

    const resolveTarget = useCallback(async (requestKey: number): Promise<Target | AssistStatus> => {
        const currentLive = isLiveProjector(projector, serverTime);
        if (currentLive) {
            if (projector.mode === 'index' || projector.mode === 'heatmap') return 'offdeck';
            if (projector.mode === 'url') return 'unsupported';
            // v gate applies to EVERY live content mode: until the projector
            // catches up to this slide version, the phone's slide.content may
            // be a different deck entirely (e.g. a PDF URL while the projector
            // still shows markdown) — never generate notes from it.
            if (projector.v !== slide.updatedAt) return 'syncing';
            if (projector.mode === 'markdown' || projector.mode === 'html') {
                return { kind: 'text', mode: projector.mode, page: 0, text: slide.content };
            }
        } else if (slide.mode === 'url') {
            return 'unsupported';
        } else if (slide.mode === 'markdown' || slide.mode === 'html') {
            return { kind: 'text', mode: slide.mode, page: 0, text: slide.content };
        }

        const url = slide.mode === 'pdf' ? slide.content.trim() : '';
        if (!url) return 'notext';
        if (!pdfRef.current || pdfRef.current.url !== url) {
            pdfRef.current?.doc.destroy();
            pdfRef.current = null;
            setNumPages(0);
            const doc = await loadPdf(url);
            if (loadKeyRef.current !== requestKey) {
                doc.destroy();
                return 'idle';
            }
            pdfRef.current = { url, doc };
            setNumPages(doc.numPages);
            setManualPage(prev => Math.max(1, Math.min(doc.numPages, prev)));
        }
        const doc = pdfRef.current.doc;
        // Clamp the live page too: a spoofed/garbage projector report must not
        // desync the displayed page label and cache key from the extracted text.
        const targetPage = Math.max(1, Math.min(
            doc.numPages,
            currentLive && projector.mode === 'pdf' ? projector.page : manualPage,
        ));
        const text = await extractPdfPageText(doc, targetPage);
        if (isAssistTextEligible(text)) {
            return { kind: 'text', mode: 'pdf', page: targetPage, text };
        }
        const imageBase64 = await renderPdfPageToJpeg(doc, targetPage);
        return imageBase64
            ? {
                kind: 'image',
                mode: 'pdf',
                page: targetPage,
                imageBase64,
                slideId: `${slide.updatedAt}#${targetPage}`,
                deckKey: slide.content,
            }
            : 'notext';
    }, [manualPage, projector, serverTime, slide]);

    // Held in a ref so the assist effect below can use the freshest resolver
    // without re-firing on every poll-driven identity change.
    const resolveTargetRef = useRef(resolveTarget);
    useEffect(() => {
        resolveTargetRef.current = resolveTarget;
    }, [resolveTarget]);

    useEffect(() => {
        if (prepareStatusRef.current === 'preparing') return;
        clearAssistRequest();
        setAssist(null);

        if (!enabled) return;
        const requestLoadKey = loadKeyRef.current + 1;
        loadKeyRef.current = requestLoadKey;
        let stopped = false;

        const run = async () => {
            setStatus('loading');
            let target: Target | AssistStatus;
            try {
                target = await resolveTargetRef.current(requestLoadKey);
            } catch {
                if (!stopped) setStatus('error');
                return;
            }
            if (stopped || loadKeyRef.current !== requestLoadKey) return;
            if (typeof target === 'string') {
                if (target !== 'idle') setStatus(target);
                return;
            }
            const key = assistCacheKey(slide.updatedAt, target, lang);
            const cached = cacheRef.current.get(key);
            if (cached) {
                activeRequestKeyRef.current = null;
                setAssist(cached);
                setStatus('ready');
                return;
            }

            activeRequestKeyRef.current = key;
            setStatus('loading');
            const debounceMs = retryBypassDebounceRef.current ? 0 : ASSIST_DEBOUNCE_MS;
            retryBypassDebounceRef.current = false;
            debounceRef.current = window.setTimeout(async () => {
                const requestKey = key;
                const controller = new AbortController();
                assistControllerRef.current = controller;
                let timedOut = false;
                const abortTimeout = window.setTimeout(() => {
                    timedOut = true;
                    controller.abort();
                }, target.kind === 'image' ? ASSIST_IMAGE_TIMEOUT_MS : ASSIST_TIMEOUT_MS);
                try {
                    const next = await fetchTargetAssist(target, lang, controller.signal);
                    cacheRef.current.set(requestKey, next);
                    // activeRequestKeyRef prevents a stale assist response from a previous
                    // page/language/deck from overwriting the current page's state.
                    if (activeRequestKeyRef.current === requestKey) {
                        setAssist(next);
                        setStatus('ready');
                    }
                } catch {
                    // A superseding effect run aborts this request AND may have
                    // re-armed the SAME key synchronously before this rejection
                    // lands — only the deliberate timeout abort is a real error.
                    if (controller.signal.aborted && !timedOut) return;
                    if (activeRequestKeyRef.current === requestKey) {
                        setAssist(null);
                        setStatus('error');
                    }
                } finally {
                    window.clearTimeout(abortTimeout);
                    if (assistControllerRef.current === controller) assistControllerRef.current = null;
                }
            }, debounceMs);
        };

        void run();

        return () => {
            stopped = true;
            clearAssistRequest();
        };
        // page/liveMode/syncing/slide fields are the primitive target
        // signature; resolveTarget itself is reached via ref (see above).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearAssistRequest, enabled, lang, retryNonce, slide.updatedAt, slide.mode, slide.content, liveMode, page, syncing]);

    const prevManualPage = useCallback(() => {
        setManualPage(page => Math.max(1, page - 1));
    }, []);

    const nextManualPage = useCallback(() => {
        setManualPage(page => numPages > 0 ? Math.min(numPages, page + 1) : page + 1);
    }, [numPages]);

    const retry = useCallback(() => {
        retryBypassDebounceRef.current = true;
        setRetryNonce(n => n + 1);
    }, []);

    const cancelPrepare = useCallback(() => {
        if (prepareStatusRef.current !== 'preparing') return;
        prepareStatusRef.current = 'cancelled';
        const run = prepareRunRef.current;
        if (run) {
            run.cancelled = true;
            run.controller?.abort();
        }
        setPrepareState(prev => ({ ...prev, status: 'cancelled' }));
        setRetryNonce(n => n + 1);
    }, []);

    const startPrepare = useCallback(() => {
        if (prepareStatusRef.current === 'preparing') return;
        if (slide.mode !== 'pdf' || numPages <= 0) return;

        // Abort any in-flight LIVE request before starting. Without this, a live
        // generation already between resolve and fetch races the prepare loop on
        // the same page: neither has written cache yet, so both miss and both fire
        // a vision call — double spend on the most expensive path in the system.
        // Nothing is lost: prepare re-warms every page, including this one.
        clearAssistRequest();

        const run = { cancelled: false, controller: null as AbortController | null };
        prepareRunRef.current = run;
        prepareStatusRef.current = 'preparing';
        setPrepareState({ status: 'preparing', done: 0, total: numPages, failed: [] });

        const runPage = async (targetPage: number): Promise<'done' | 'failed' | 'cancelled'> => {
            const requestLoadKey = loadKeyRef.current;
            if (run.cancelled) return 'cancelled';
            let target: Target | AssistStatus;
            try {
                const doc = pdfRef.current?.url === slide.content ? pdfRef.current.doc : await loadPdf(slide.content);
                if (run.cancelled) {
                    if (pdfRef.current?.doc !== doc) doc.destroy();
                    return 'cancelled';
                }
                if (pdfRef.current?.url !== slide.content) {
                    pdfRef.current?.doc.destroy();
                    pdfRef.current = { url: slide.content, doc };
                    setNumPages(doc.numPages);
                }
                const safePage = Math.max(1, Math.min(doc.numPages, targetPage));
                const text = await extractPdfPageText(doc, safePage);
                if (run.cancelled) return 'cancelled';
                if (isAssistTextEligible(text)) {
                    target = { kind: 'text', mode: 'pdf', page: safePage, text };
                } else {
                    const imageBase64 = await renderPdfPageToJpeg(doc, safePage);
                    if (run.cancelled) return 'cancelled';
                    target = imageBase64
                        ? {
                            kind: 'image',
                            mode: 'pdf',
                            page: safePage,
                            imageBase64,
                            slideId: `${slide.updatedAt}#${safePage}`,
                            deckKey: slide.content,
                        }
                        : 'notext';
                }
            } catch {
                return run.cancelled ? 'cancelled' : 'failed';
            }
            if (run.cancelled || loadKeyRef.current !== requestLoadKey) return 'cancelled';
            if (typeof target === 'string') return target === 'notext' ? 'failed' : 'cancelled';
            const key = assistCacheKey(slide.updatedAt, target, lang);
            const cached = cacheRef.current.get(key);
            if (cached) return 'done';
            const controller = new AbortController();
            run.controller = controller;
            let timedOut = false;
            const abortTimeout = window.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, target.kind === 'image' ? ASSIST_IMAGE_TIMEOUT_MS : ASSIST_TIMEOUT_MS);
            try {
                const next = await fetchTargetAssist(target, lang, controller.signal);
                if (run.cancelled) return 'cancelled';
                cacheRef.current.set(key, next);
                return 'done';
            } catch {
                return controller.signal.aborted && !timedOut ? 'cancelled' : 'failed';
            } finally {
                window.clearTimeout(abortTimeout);
                if (run.controller === controller) run.controller = null;
            }
        };

        void (async () => {
            const failed: number[] = [];
            let done = 0;
            for (let targetPage = 1; targetPage <= numPages; targetPage += 1) {
                if (run.cancelled) break;
                const result = await runPage(targetPage);
                if (run.cancelled || result === 'cancelled') break;
                if (result === 'done') done += 1;
                if (result === 'failed') failed.push(targetPage);
                setPrepareState({ status: 'preparing', done, total: numPages, failed: [...failed] });
            }
            if (prepareRunRef.current !== run) return;
            prepareRunRef.current = null;
            if (run.cancelled) return;
            prepareStatusRef.current = 'done';
            setPrepareState({ status: 'done', done, total: numPages, failed });
            setRetryNonce(n => n + 1);
        })();
    }, [lang, numPages, slide.content, slide.mode, slide.updatedAt]);

    useEffect(() => {
        if (prepareStatusRef.current !== 'preparing') return;
        const run = prepareRunRef.current;
        if (run) {
            run.cancelled = true;
            run.controller?.abort();
        }
        prepareRunRef.current = null;
        prepareStatusRef.current = 'idle';
        setPrepareState({ status: 'idle', done: 0, total: 0, failed: [] });
        // `lang` belongs here: the in-flight run closed over the OLD lang, so a
        // mid-run language switch would otherwise keep warming the whole deck in
        // the language the user just navigated away from — a full deck of vision
        // calls, paid for, that they will not see.
    }, [slide.updatedAt, slide.content, lang]);

    useEffect(() => {
        return () => {
            const run = prepareRunRef.current;
            if (run) {
                run.cancelled = true;
                run.controller?.abort();
            }
            prepareRunRef.current = null;
        };
    }, []);

    return {
        status,
        assist,
        page,
        numPages,
        live,
        retry,
        prevManualPage,
        nextManualPage,
        prepare: {
            ...prepareState,
            failed: [...prepareState.failed].sort((a, b) => a - b),
            start: startPrepare,
            cancel: cancelPrepare,
        },
    };
}
