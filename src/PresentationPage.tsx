import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { getSettings, setSetting, type PresentSlide, type PresentSlideMode } from './utils';
import enLocale from './locales/en.ts';
import { Pencil, Maximize2, Minimize2, ExternalLink, X, Keyboard, LayoutGrid, Rows3, EyeOff } from 'lucide-react';

const PINNED_SYMBOLS = ['^GSPC', '^IXIC', '^HSI', 'GC=F'];
const REFRESH_MS = 10 * 60 * 1000;

type StripMode = 'compact' | 'full' | 'hidden';
const STRIP_MODES: StripMode[] = ['compact', 'full', 'hidden'];

export default function PresentationPage() {
    const [marketData, setMarketData] = useState<any[]>([]);
    const [slide, setSlide] = useState<PresentSlide>(() => getSettings().presentSlide);
    const [editorOpen, setEditorOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHints, setShowHints] = useState(false);
    const [stripMode, setStripMode] = useState<StripMode>('compact');
    const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString());
    const hintsTimerRef = useRef<number | null>(null);

    const t = { ...enLocale, language: 'en', activeRange: 'YTD' };

    const fetchData = useCallback(async () => {
        try {
            const lang = getSettings().lang;
            const res = await fetch(`/api/market-data?t=${Date.now()}&range=YTD&lang=${lang}`);
            const json = await res.json();
            if (json?.data && Array.isArray(json.data)) setMarketData(json.data);
        } catch (err) {
            console.error('Presentation fetch failed', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const id = setInterval(fetchData, REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchData]);

    useEffect(() => {
        const id = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(id);
    }, []);

    // Auto-show hints overlay briefly on first mount, then auto-hide
    useEffect(() => {
        setShowHints(true);
        hintsTimerRef.current = window.setTimeout(() => setShowHints(false), 4500);
        return () => {
            if (hintsTimerRef.current) clearTimeout(hintsTimerRef.current);
        };
    }, []);

    // Cross-tab sync
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

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    }, []);

    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Ignore shortcuts while typing in textarea/input
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

            if (e.key === 'e' || e.key === 'E') setEditorOpen(o => !o);
            if (e.key === 'f' || e.key === 'F') toggleFullscreen();
            if (e.key === 's' || e.key === 'S') {
                setStripMode(m => STRIP_MODES[(STRIP_MODES.indexOf(m) + 1) % STRIP_MODES.length]);
            }
            if (e.key === '?' || e.key === '/') setShowHints(s => !s);
            if (e.key === 'Escape') {
                setEditorOpen(false);
                setShowHints(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleFullscreen]);

    const pinned = PINNED_SYMBOLS
        .map(sym => marketData.find(d => d.symbol === sym))
        .filter(Boolean);

    const saveSlide = (next: Partial<PresentSlide>) => {
        const merged: PresentSlide = { ...slide, ...next, updatedAt: Date.now() };
        setSlide(merged);
        setSetting('presentSlide', merged);
    };

    return (
        <div className="min-h-screen w-full bg-black text-zinc-100 flex flex-col relative">
            {/* Top bar */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-zinc-900">
                <div className="text-sm font-mono tracking-widest text-zinc-500">
                    MARKETFLOW · PRESENT
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-sm font-mono text-zinc-400">{clock}</div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setStripMode(m => STRIP_MODES[(STRIP_MODES.indexOf(m) + 1) % STRIP_MODES.length])}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title={`Strip: ${stripMode} (S)`}
                        >
                            {stripMode === 'full' ? <LayoutGrid className="w-4 h-4" />
                                : stripMode === 'compact' ? <Rows3 className="w-4 h-4" />
                                : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setEditorOpen(o => !o)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${editorOpen ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Edit slide (E)"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title="Fullscreen (F)"
                        >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setShowHints(s => !s)}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title="Shortcuts (?)"
                        >
                            <Keyboard className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Pinned live strip */}
            {stripMode === 'full' && (
                <div className="grid grid-cols-4 gap-4 px-8 py-6 border-b border-zinc-900">
                    {pinned.length > 0
                        ? pinned.map((item: any) => (
                            <MarketStatCard key={item.symbol} item={item} t={t} chartHeight="h-20" />
                        ))
                        : Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-40 rounded-xl bg-zinc-900/40 animate-pulse" />
                        ))}
                </div>
            )}
            {stripMode === 'compact' && (
                <div className="flex items-center gap-6 px-8 py-2 border-b border-zinc-900 bg-zinc-950/50 overflow-x-auto">
                    {pinned.length > 0 ? pinned.map((item: any) => {
                        const pos = item.change >= 0;
                        return (
                            <div key={item.symbol} className="flex items-baseline gap-2 whitespace-nowrap">
                                <span className="text-[11px] font-mono text-zinc-500 tracking-wider">{item.symbol}</span>
                                <span className="text-sm font-mono font-bold text-zinc-100">
                                    {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className={`text-xs font-mono ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {pos ? '+' : ''}{item.changePercent.toFixed(2)}%
                                </span>
                            </div>
                        );
                    }) : <span className="text-xs text-zinc-600">Loading…</span>}
                </div>
            )}

            {/* Slide area */}
            <div className="flex-1 relative overflow-hidden">
                <SlideRenderer slide={slide} marketData={marketData} />
            </div>

            {/* Slide-in editor panel */}
            <div
                className={`
                    fixed top-0 right-0 h-full w-[460px] bg-zinc-950 border-l border-zinc-800
                    shadow-2xl z-40 transform transition-transform duration-300
                    ${editorOpen ? 'translate-x-0' : 'translate-x-full'}
                `}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-mono tracking-widest text-zinc-300">SLIDE EDITOR</h2>
                    <button
                        onClick={() => setEditorOpen(false)}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-3 h-[calc(100%-49px)]">
                    {/* Mode tabs */}
                    <div className="flex gap-1">
                        {(['markdown', 'html', 'url'] as PresentSlideMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => saveSlide({ mode: m })}
                                className={`flex-1 px-2 py-1.5 text-xs font-mono uppercase rounded ${
                                    slide.mode === m
                                        ? 'bg-emerald-500 text-black font-bold'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                            >
                                {m === 'markdown' ? 'MD' : m.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                try {
                                    const text = await navigator.clipboard.readText();
                                    if (text) saveSlide({ content: text });
                                } catch {
                                    alert('Clipboard blocked. Paste into the textarea with Cmd+V.');
                                }
                            }}
                            className="flex-1 text-xs px-2 py-1.5 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                        >
                            Paste from clipboard
                        </button>
                        <button
                            onClick={() => saveSlide({ content: '' })}
                            className="text-xs px-2 py-1.5 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Textarea */}
                    <textarea
                        value={slide.content}
                        onChange={e => saveSlide({ content: e.target.value })}
                        placeholder={
                            slide.mode === 'url'
                                ? 'https://docs.google.com/presentation/d/e/.../embed'
                                : slide.mode === 'html'
                                ? '<!DOCTYPE html>...'
                                : '# Heading\n\nParagraph with **bold** and {{^GSPC.price}} tokens'
                        }
                        spellCheck={false}
                        className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                    />

                    {/* Footer */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{slide.content.length} chars · autosaved</span>
                        <a
                            href="/present-control"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 hover:text-emerald-400"
                        >
                            Full editor <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            </div>

            {/* Shortcut hints overlay */}
            {showHints && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl px-5 py-3 z-50 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-5 text-xs">
                        <span className="text-zinc-500">Shortcuts:</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">E</kbd>
                        <span className="text-zinc-400">edit</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">F</kbd>
                        <span className="text-zinc-400">fullscreen</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">S</kbd>
                        <span className="text-zinc-400">strip size</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">?</kbd>
                        <span className="text-zinc-400">toggle this</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">Esc</kbd>
                        <span className="text-zinc-400">close</span>
                    </div>
                </div>
            )}
        </div>
    );
}
