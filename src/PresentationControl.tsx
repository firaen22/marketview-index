import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings, setSetting, loadRemoteSlide, saveRemoteSlide, deletePdf, type PresentSlide, type PresentSlideMode } from './utils';
import { SlideRenderer } from './components/SlideRenderer';
import { PdfUploader } from './components/PdfUploader';

const MODE_HINTS: Record<PresentSlideMode, string> = {
    markdown: '# Heading\n\nParagraph with **bold** and {{SPX.price}} tokens.\n\n- bullet one\n- bullet two',
    html: '<!DOCTYPE html>\n<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;padding:4rem">\n  <h1 style="color:#34d399;font-size:4rem">Slide Title</h1>\n  <p style="font-size:2rem">Pasted Claude HTML renders sandboxed.</p>\n</body></html>',
    url: 'https://docs.google.com/presentation/d/e/YOUR_PUBLISHED_ID/embed',
    pdf: '',
};

const EXAMPLES: Record<PresentSlideMode, { label: string; content: string }[]> = {
    markdown: [
        {
            label: 'Market snapshot',
            content: '# Today\'s Market View\n\n- **S&P 500** at {{^GSPC.price}} ({{^GSPC.changePercent}}%)\n- **Nasdaq** at {{^IXIC.price}}\n- **Hang Seng** at {{^HSI.price}}\n\n> Watch VIX for regime shifts.',
        },
    ],
    html: [],
    url: [],
    pdf: [],
};

export default function PresentationControl() {
    const [slide, setSlide] = useState<PresentSlide>(() => getSettings().presentSlide);
    const [marketData, setMarketData] = useState<any[]>([]);
    const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
    const [sizeWarning, setSizeWarning] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [, setTick] = useState(0);
    const saveTimerRef = useRef<number | null>(null);

    const MAX_CONTENT_BYTES = 256 * 1024;
    const SAVE_DEBOUNCE_MS = 800;

    const formatRelativeTime = (ts: number): string => {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    };

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 15000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        fetch(`/api/market-data?t=${Date.now()}&range=YTD&lang=en`)
            .then(r => r.json())
            .then(j => { if (j?.data) setMarketData(j.data); })
            .catch(() => {});
        // Load cloud slide on mount — use it if newer than local
        loadRemoteSlide().then(remote => {
            if (remote && remote.updatedAt > getSettings().presentSlide.updatedAt) {
                setSlide(remote);
                setSetting('presentSlide', remote);
            }
        });
    }, []);

    // Stay in sync if another tab updates (e.g. the /present quick-paste panel)
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === 'marketflow_settings' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed?.presentSlide) setSlide(parsed.presentSlide);
                } catch {}
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const commit = (next: PresentSlide) => {
        setSlide(next);
        setSetting('presentSlide', next);

        const byteSize = new Blob([next.content]).size;
        if (byteSize > MAX_CONTENT_BYTES) {
            setSizeWarning(`Content is ${(byteSize / 1024).toFixed(0)} KB — max ${MAX_CONTENT_BYTES / 1024} KB. Not synced to cloud.`);
            setCloudStatus('error');
            return;
        }
        setSizeWarning(null);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setCloudStatus('saving');
        saveTimerRef.current = window.setTimeout(() => {
            saveRemoteSlide(next).then(() => {
                setCloudStatus('ok');
                setLastSavedAt(Date.now());
                window.setTimeout(() => setCloudStatus('idle'), 2000);
            }).catch(() => {
                setCloudStatus('error');
                window.setTimeout(() => setCloudStatus('idle'), 3000);
            });
        }, SAVE_DEBOUNCE_MS);
    };

    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    }, []);

    const updateMode = (mode: PresentSlideMode) => {
        commit({ ...slide, mode, updatedAt: Date.now() });
    };

    const updateContent = (content: string) => {
        commit({ ...slide, content, updatedAt: Date.now() });
    };

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) updateContent(text);
        } catch {
            alert('Clipboard access denied. Paste manually with Cmd+V.');
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-900">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-200">← Dashboard</Link>
                    <h1 className="text-sm font-mono tracking-widest text-zinc-300">PRESENTATION · CONTROL</h1>
                </div>
                <div className="flex items-center gap-3">
                    {cloudStatus === 'saving' && <span className="text-xs text-zinc-400 animate-pulse">☁ saving…</span>}
                    {cloudStatus === 'ok' && <span className="text-xs text-emerald-400">☁ saved to cloud</span>}
                    {cloudStatus === 'error' && <span className="text-xs text-rose-400">☁ save failed</span>}
                    <button
                        onClick={() => {
                            const w = screen.availWidth;
                            const h = screen.availHeight;
                            window.open(
                                '/present',
                                'marketflow_present',
                                `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`
                            );
                        }}
                        className="text-xs px-3 py-1.5 bg-emerald-500 text-black rounded font-bold hover:bg-emerald-400 flex items-center gap-1.5"
                        title="Opens /present in a new window — drag it to your projector"
                    >
                        🎬 Launch Display
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-0 h-[calc(100vh-49px)]">
                {/* LEFT — Editor */}
                <div className="border-r border-zinc-900 flex flex-col">
                    {/* Mode tabs */}
                    <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-900">
                        {(['markdown', 'html', 'url', 'pdf'] as PresentSlideMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => updateMode(m)}
                                className={`px-3 py-1.5 text-xs font-mono uppercase rounded ${
                                    slide.mode === m
                                        ? 'bg-emerald-500 text-black font-bold'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                            >
                                {m === 'markdown' ? 'Markdown' : m.toUpperCase()}
                            </button>
                        ))}
                        <div className="flex-1" />
                        <button
                            onClick={pasteFromClipboard}
                            className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                        >
                            Paste
                        </button>
                        <button
                            onClick={() => {
                                if (slide.mode === 'pdf' && slide.content) deletePdf(slide.content);
                                updateContent('');
                            }}
                            className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                        >
                            Clear
                        </button>
                    </div>

                    {/* PDF uploader or textarea */}
                    {slide.mode === 'pdf' ? (
                        <div className="flex-1 flex flex-col gap-4 p-6">
                            <PdfUploader onUploaded={url => {
                                if (slide.mode === 'pdf' && slide.content && slide.content !== url) {
                                    deletePdf(slide.content);
                                }
                                updateContent(url);
                            }} />
                            {slide.content && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Current PDF URL</span>
                                    <a
                                        href={slide.content}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-mono text-emerald-400 truncate hover:underline"
                                    >
                                        {slide.content}
                                    </a>
                                    <button
                                        onClick={() => {
                                            if (slide.content) deletePdf(slide.content);
                                            updateContent('');
                                        }}
                                        className="mt-1 self-start text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:bg-zinc-700"
                                    >
                                        Replace PDF
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <textarea
                            value={slide.content}
                            onChange={e => updateContent(e.target.value)}
                            placeholder={MODE_HINTS[slide.mode]}
                            className="flex-1 w-full bg-zinc-950 p-6 font-mono text-sm text-zinc-200 resize-none focus:outline-none border-0"
                            spellCheck={false}
                        />
                    )}

                    {/* Footer */}
                    {sizeWarning && (
                        <div className="px-6 py-2 text-xs text-rose-400 bg-rose-500/10 border-t border-rose-500/30">
                            {sizeWarning}
                        </div>
                    )}
                    <div className="px-6 py-2 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500">
                        <span>
                            {slide.content.length} chars
                            {lastSavedAt ? ` · saved ${formatRelativeTime(lastSavedAt)}` : ' · not yet saved'}
                        </span>
                        {slide.mode === 'markdown' && (
                            <span className="font-mono">tokens: {'{{^GSPC.price}}'}, {'{{^HSI.changePercent}}'}</span>
                        )}
                    </div>
                </div>

                {/* RIGHT — Live preview */}
                <div className="flex flex-col bg-black">
                    <div className="px-6 py-3 border-b border-zinc-900 flex items-center justify-between">
                        <span className="text-xs font-mono tracking-widest text-zinc-500">PREVIEW</span>
                        {EXAMPLES[slide.mode].length > 0 && (
                            <div className="flex gap-2">
                                {EXAMPLES[slide.mode].map(ex => (
                                    <button
                                        key={ex.label}
                                        onClick={() => updateContent(ex.content)}
                                        className="text-xs px-2 py-1 bg-zinc-900 rounded text-zinc-400 hover:bg-zinc-800"
                                    >
                                        {ex.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <SlideRenderer slide={slide} marketData={marketData} />
                    </div>
                </div>
            </div>
        </div>
    );
}
