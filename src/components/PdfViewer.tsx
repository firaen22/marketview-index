import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite ?url import
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

interface Props {
    url: string;
    zoom?: number;
}

export const PdfViewer: React.FC<Props> = ({ url, zoom = 100 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        setPageNum(1);
        setPdf(null);
        const task = pdfjsLib.getDocument(url);
        task.promise
            .then(doc => {
                if (cancelled) { doc.destroy(); return; }
                setPdf(doc); setNumPages(doc.numPages); setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                setError(err?.message || 'Failed to load PDF'); setLoading(false);
            });
        return () => { cancelled = true; task.destroy(); };
    }, [url]);

    useEffect(() => {
        if (!pdf || !canvasRef.current) return;
        if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }

        let cancelled = false;
        pdf.getPage(pageNum).then(page => {
            if (cancelled || !canvasRef.current) return;
            const dpr = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: (zoom / 100) * dpr });
            const canvas = canvasRef.current;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / dpr}px`;
            canvas.style.height = `${viewport.height / dpr}px`;
            const rt = page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport });
            renderTaskRef.current = rt;
            rt.promise.catch(err => {
                if (err?.name !== 'RenderingCancelledException') {
                    console.error('PDF render error:', err);
                    if (!cancelled) setError(err?.message || 'Failed to render PDF page');
                }
            });
        });
        return () => { cancelled = true; };
    }, [pdf, pageNum, zoom]);

    const prev = useCallback(() => setPageNum(p => Math.max(1, p - 1)), []);
    const next = useCallback(() => setPageNum(p => Math.min(numPages, p + 1)), [numPages]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'TEXTAREA' || tag === 'INPUT') return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prev(); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); next(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [prev, next]);

    if (error) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm">{error}</div>
        );
    }

    return (
        <div className="absolute inset-0 bg-zinc-950 overflow-auto">
            <div className="min-h-full flex items-start justify-center py-6 px-4 pb-20">
                {loading
                    ? <div className="text-zinc-500 text-sm">Loading PDF…</div>
                    : <canvas ref={canvasRef} className="shadow-2xl" />
                }
            </div>

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
};
