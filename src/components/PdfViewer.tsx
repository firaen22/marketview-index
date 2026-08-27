import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite ?url import
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
    extractJargonImageBase64,
    JARGON_MIN_TEXT_LEN,
    jargonImageDims,
} from '../jargon';
import { jargonDebug } from '../jargonDebug';
import { getLocale } from '../locales';
import { useRootScale } from '../hooks/useViewportScale';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

// How long a load may run before the projector says so. This does NOT abort
// anything — it only surfaces a hint and keeps the manual reload in reach.
//
// An automatic abort was tried and removed. It cannot be built on pdfjs's
// progress callback: when the server advertises BOTH streaming and byte ranges
// — which the R2 proxy does — pdfjs detaches it (`pdf.mjs:15856`
// `if (isStreamingSupported && isRangeSupported) this.#fullReader.onProgress = null`),
// and every range reader is constructed with `onProgress: null`
// (`pdf.mjs:13477`). So on the real production path the callback can go silent
// for the whole load while the transfer is perfectly healthy, and any timer
// re-armed by it degenerates into a fixed guillotine. Measured loads of the
// live deck ranged from 21s to 153s, so a guillotine short enough to be useful
// would fire on healthy loads — in front of an audience. A slow deck must
// never be killed; it must be legible, and the presenter must have a way out.
export const PDF_SLOW_LOAD_HINT_MS = 30_000;

interface Props {
    url: string;
    zoom?: number;
    keyboardEnabled?: boolean;
    onPageText?: (page: number, text: string, imageDataUrl?: string) => void;
    onPageChange?: (page: number) => void;
    lang?: 'en' | 'zh-TW';
}

export interface PdfViewerHandle {
    prevPage: () => void;
    nextPage: () => void;
    // Returns false when the document is not paged yet (still downloading, or
    // it failed to load) so a remote `goto` can be retried instead of being
    // acknowledged and lost.
    goToPage: (page: number | 'last') => boolean;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(({ url, zoom = 100, keyboardEnabled = true, onPageText, onPageChange, lang = 'en' }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const uiScale = useRootScale();
    const L = getLocale(lang).present;
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // -1 = the server sent no length, so a percentage would be a lie.
    const [progress, setProgress] = useState(-1);
    const [retryNonce, setRetryNonce] = useState(0);
    const [slow, setSlow] = useState(false);
    // The localized strings are read through a ref so they can be used inside
    // the load/render effects WITHOUT sitting in their dependency arrays. They
    // are only ever error fallbacks, but as deps they made a language change
    // (which arrives cross-tab via useSettingsSync, mid-presentation) tear down
    // and re-download the whole deck and reset the presenter to page 1.
    const LRef = useRef(L);
    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
    const captureTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => { LRef.current = L; });

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        setPageNum(1);
        setNumPages(0);
        setPdf(null);
        setProgress(-1);
        setSlow(false);
        const task = pdfjsLib.getDocument(url);

        // Purely cosmetic: flips the "this is taking a while" hint on. Nothing
        // is cancelled when it fires — see PDF_SLOW_LOAD_HINT_MS.
        const hintTimer = window.setTimeout(() => {
            if (!cancelled) setSlow(true);
        }, PDF_SLOW_LOAD_HINT_MS);

        // Kept for the percentage when pdfjs does supply it (a server without
        // range support still reports). It is never load-bearing: on the
        // production path it may never fire at all.
        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
            if (cancelled) return;
            setProgress(total > 0 ? Math.min(1, loaded / total) : -1);
        };

        task.promise
            .then(doc => {
                window.clearTimeout(hintTimer);
                if (cancelled) { doc.destroy(); return; }
                setPdf(doc); setNumPages(doc.numPages); setLoading(false);
            })
            .catch(err => {
                window.clearTimeout(hintTimer);
                if (cancelled) return;
                setError(err?.message || LRef.current.pdfLoadError); setLoading(false);
            });
        return () => { cancelled = true; window.clearTimeout(hintTimer); task.destroy(); };
    }, [url, retryNonce]);

    useEffect(() => {
        if (!pdf || !canvasRef.current) return;
        if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }

        let cancelled = false;
        pdf.getPage(pageNum).then(page => {
            if (cancelled || !canvasRef.current) return;
            const dpr = window.devicePixelRatio || 1;
            // `uiScale` keeps the deck the same apparent size across resolutions.
            // The page is laid out in PDF points, so at 100% zoom a 960pt slide
            // occupied 960 CSS px — a quarter of a 4K projector's width, against
            // half of a 1080p one. Folding the root scale in means "100%" keeps
            // meaning "as large as it looked at 1080p", and the presenter's
            // 25%-step zoom control still reads relative to that.
            const viewport = page.getViewport({ scale: (zoom / 100) * uiScale * dpr });
            const canvas = canvasRef.current;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / dpr}px`;
            canvas.style.height = `${viewport.height / dpr}px`;
            const rt = page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport });
            renderTaskRef.current = rt;
            rt.promise.then(() => {
                // Clear a previous page's failure once any page renders again,
                // so a one-off error does not outlive the page that caused it.
                if (!cancelled) setError('');
            }, err => {
                if (err?.name !== 'RenderingCancelledException') {
                    console.error('PDF render error:', err);
                    if (!cancelled) setError(err?.message || LRef.current.pdfRenderError);
                }
            });
        }).catch(err => {
            if (cancelled) return;
            if (err?.name === 'RenderingCancelledException') return;
            console.error('PDF page load error:', err);
            setError(err?.message || LRef.current.pdfPageError);
        });
        return () => {
            cancelled = true;
            if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
        };
    }, [pdf, pageNum, zoom, uiScale]);

    useEffect(() => {
        if (!pdf || !onPageChange) return;
        onPageChange(pageNum);
    }, [pdf, pageNum, onPageChange]);

    useEffect(() => {
        if (!pdf || !onPageText) return;
        let cancelled = false;

        const captureImage = (text: string) => {
            pdf.getPage(pageNum)
                .then(async page => {
                    if (cancelled) return;
                    const sourceViewport = page.getViewport({ scale: 1 });
                    const target = jargonImageDims(sourceViewport.width, sourceViewport.height);
                    jargonDebug('captureStart', { page: pageNum, w: target.width, h: target.height });
                    const scale = sourceViewport.width > 0 ? target.width / sourceViewport.width : 1;
                    const viewport = page.getViewport({ scale });
                    captureTaskRef.current?.cancel();
                    captureTaskRef.current = null;
                    const canvas = captureCanvasRef.current ?? document.createElement('canvas');
                    captureCanvasRef.current = canvas;
                    canvas.width = target.width;
                    canvas.height = target.height;
                    const context = canvas.getContext('2d');
                    if (!context) { jargonDebug('captureNoContext', { page: pageNum }); return; }
                    const rt = page.render({ canvasContext: context, canvas, viewport });
                    captureTaskRef.current = rt;
                    try {
                        await rt.promise;
                    } catch (err) {
                        if ((err as Error)?.name === 'RenderingCancelledException') return;
                        throw err;
                    } finally {
                        if (captureTaskRef.current === rt) captureTaskRef.current = null;
                    }
                    if (cancelled) return;

                    let imageDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    if (!extractJargonImageBase64(imageDataUrl)) {
                        jargonDebug('captureRetryLowQ', { page: pageNum, len: imageDataUrl.length, prefix: imageDataUrl.slice(0, 30) });
                        imageDataUrl = canvas.toDataURL('image/jpeg', 0.5);
                    }
                    const valid = extractJargonImageBase64(imageDataUrl);
                    jargonDebug('captureDone', { page: pageNum, b64len: valid ? valid.length : null, prefix: imageDataUrl.slice(0, 30) });
                    if (!cancelled && valid) {
                        onPageText(pageNum, text, imageDataUrl);
                    }
                })
                .catch((err) => {
                    if ((err as Error)?.name === 'RenderingCancelledException') return;
                    jargonDebug('captureError', { page: pageNum, err: String(err).slice(0, 200) });
                });
        };

        pdf.getPage(pageNum)
            .then(page => page.getTextContent())
            .then(tc => {
                if (cancelled) return;
                const text = tc.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ');
                jargonDebug('textExtracted', { page: pageNum, len: text.trim().length });
                onPageText(pageNum, text);
                if (text.trim().length >= JARGON_MIN_TEXT_LEN) return;
                captureImage(text);
            })
            .catch((err) => {
                jargonDebug('textError', { page: pageNum, err: String(err).slice(0, 200) });
                if (cancelled) return;
                onPageText(pageNum, '');
                // getTextContent() throws on iOS Safari (pdf.js engine
                // incompatibility) even though page rendering works — fall back
                // to the image path so those devices still get jargon via OCR.
                captureImage('');
            });
        return () => {
            cancelled = true;
            captureTaskRef.current?.cancel();
            captureTaskRef.current = null;
        };
    }, [pdf, pageNum, onPageText]);

    const prev = useCallback(() => setPageNum(p => Math.max(1, p - 1)), []);
    const next = useCallback(() => setPageNum(p => Math.max(1, Math.min(numPages, p + 1))), [numPages]);
    const goToPage = useCallback((page: number | 'last') => {
        if (numPages <= 0) return false;
        setPageNum(page === 'last' ? numPages : Math.max(1, Math.min(numPages, page)));
        return true;
    }, [numPages]);

    useImperativeHandle(ref, () => ({ prevPage: prev, nextPage: next, goToPage }), [prev, next, goToPage]);

    useEffect(() => {
        if (!keyboardEnabled) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'TEXTAREA' || tag === 'INPUT') return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prev(); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); next(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [prev, next, keyboardEnabled]);

    return (
        <div className="absolute inset-0 bg-zinc-950 overflow-auto">
            <div className="min-h-full flex items-start justify-center py-6 px-4 pb-20">
                {loading
                    ? <div className="flex flex-col items-center gap-3 text-sm">
                        <span className="text-zinc-500">
                            {progress >= 0
                                ? `${L.pdfLoading} ${Math.round(progress * 100)}%`
                                : L.pdfLoading}
                        </span>
                        {/* A big deck legitimately takes a while, so the way out
                            is offered rather than taken: the presenter decides,
                            no timer ever discards a load that is still healthy. */}
                        {slow && (
                            <>
                                <span className="text-zinc-600">{L.pdfSlow}</span>
                                <button
                                    onClick={() => setRetryNonce(n => n + 1)}
                                    className="px-4 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
                                >{L.pdfRetry}</button>
                            </>
                        )}
                    </div>
                    : <canvas ref={canvasRef} className="shadow-2xl" />
                }
            </div>

            {/* Overlay, not an early return: unmounting the canvas here used to
                strand the render effect on its `!canvasRef.current` guard, so a
                single transient page failure blanked the deck permanently — no
                page turn could recover it. The nav pill (z-30) stays above this
                so the presenter can always page away from a broken slide. */}
            {error && (
                <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-rose-400 text-sm">
                    <span>{error}</span>
                    {!pdf && (
                        <button
                            onClick={() => setRetryNonce(n => n + 1)}
                            className="px-4 py-2 rounded-full border border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500"
                        >{L.pdfRetry}</button>
                    )}
                </div>
            )}

            {/* Floating page navigation pill (bottom-center) */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-full px-3 py-1.5 z-30">
                <button
                    onClick={prev}
                    disabled={pageNum <= 1}
                    className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg"
                    title="Previous page (←)"
                >←</button>
                <span className="text-xs font-mono text-zinc-300 w-16 text-center select-none">
                    {loading ? '…' : `${pageNum} / ${numPages}`}
                </span>
                <button
                    onClick={next}
                    disabled={pageNum >= numPages}
                    className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg"
                    title="Next page (→)"
                >→</button>
            </div>
        </div>
    );
});
