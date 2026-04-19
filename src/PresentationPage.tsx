import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { getSettings, setSetting, loadRemoteSlide, type PresentSlide, type PresentSlideMode } from './utils';
import { PdfUploader } from './components/PdfUploader';
import enLocale from './locales/en.ts';
import zhLocale from './locales/zh-TW.ts';
import { Pencil, Maximize2, Minimize2, ExternalLink, X, Keyboard, LayoutGrid, Rows3, EyeOff, LayoutDashboard, Presentation, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const PINNED_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^HSI', '^N225', 'GC=F', 'BTC-USD', 'CL=F'];
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
    const [pdfZoom, setPdfZoom] = useState(100);
    const [mainView, setMainView] = useState<'slide' | 'index'>('slide');
    const [quoteOpen, setQuoteOpen] = useState(false);
    const [pinnedQuote, setPinnedQuote] = useState<any | null>(null);
    const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString());
    const hintsTimerRef = useRef<number | null>(null);

    const lang = getSettings().lang;
    const t = { ...(lang === 'zh-TW' ? zhLocale : enLocale), language: lang, activeRange: 'YTD' };

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

    // Load slide from server on mount (overrides localStorage if newer)
    useEffect(() => {
        loadRemoteSlide().then(remote => {
            if (remote && remote.updatedAt > slide.updatedAt) {
                setSlide(remote);
                setSetting('presentSlide', remote);
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            if (e.key === 'i' || e.key === 'I') setMainView(v => v === 'slide' ? 'index' : 'slide');
            if (e.key === 'q' || e.key === 'Q') setQuoteOpen(o => !o);
            if (e.key === '?' || e.key === '/') setShowHints(s => !s);
            if (e.key === 'Escape') {
                setEditorOpen(false);
                setShowHints(false);
                setQuoteOpen(false);
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
                            onClick={() => setMainView(v => v === 'slide' ? 'index' : 'slide')}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${mainView === 'index' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title={`Toggle ${mainView === 'slide' ? 'Index' : 'Slide'} (I)`}
                        >
                            {mainView === 'slide' ? <LayoutDashboard className="w-4 h-4" /> : <Presentation className="w-4 h-4" />}
                        </button>
                        <Link
                            to="/"
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400 hover:text-emerald-400"
                            title="Exit to Dashboard"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Link>
                        <div className="h-4 w-px bg-zinc-800 mx-1"></div>
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
                            onClick={() => setQuoteOpen(o => !o)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${quoteOpen || pinnedQuote ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Quote overlay (Q)"
                        >
                            <TrendingUp className="w-4 h-4" />
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
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 px-8 py-6 border-b border-zinc-900">
                    {pinned.length > 0
                        ? pinned.map((item: any) => (
                            <MarketStatCard key={item.symbol} item={item} t={t} chartHeight="h-16" />
                        ))
                        : Array.from({ length: PINNED_SYMBOLS.length }).map((_, i) => (
                            <div key={i} className="h-36 rounded-xl bg-zinc-900/40 animate-pulse" />
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
                <div className={mainView === 'slide' ? 'w-full h-full' : 'hidden'}>
                    <SlideRenderer slide={slide} marketData={marketData} pdfZoom={pdfZoom} />
                </div>
                {mainView === 'index' && (
                    <iframe
                        src="/?embed=1"
                        className="w-full h-full border-0 bg-black"
                        title="Market Index"
                    />
                )}

                {/* Zoom controls — shown for pdf and html modes */}
                {mainView === 'slide' && (slide.mode === 'pdf' || slide.mode === 'html') && (
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-full px-3 py-1.5 z-30">
                        <button
                            onClick={() => setPdfZoom(z => Math.max(25, z - 25))}
                            className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white text-lg font-bold"
                        >−</button>
                        <span className="text-xs font-mono text-zinc-300 w-10 text-center">{pdfZoom}%</span>
                        <button
                            onClick={() => setPdfZoom(z => Math.min(200, z + 25))}
                            className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white text-lg font-bold"
                        >+</button>
                        <div className="w-px h-3 bg-zinc-700 mx-1" />
                        <button
                            onClick={() => setPdfZoom(100)}
                            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
                        >reset</button>
                    </div>
                )}
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
                        {(['markdown', 'html', 'url', 'pdf'] as PresentSlideMode[]).map(m => (
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

                    {/* PDF uploader or textarea */}
                    {slide.mode === 'pdf' ? (
                        <div className="flex flex-col gap-3 flex-1">
                            <PdfUploader onUploaded={url => saveSlide({ content: url })} />
                            {slide.content && (
                                <p className="text-[10px] font-mono text-emerald-400 truncate">{slide.content}</p>
                            )}
                        </div>
                    ) : (
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
                    )}

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

            {/* Quote picker overlay */}
            {quoteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[420px] p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-mono tracking-widest text-zinc-400">QUICK QUOTE</span>
                            <button onClick={() => setQuoteOpen(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {marketData.map(d => {
                                const up = d.changePercent >= 0;
                                return (
                                    <button
                                        key={d.symbol}
                                        onClick={() => { setPinnedQuote(d); setQuoteOpen(false); }}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition text-left"
                                    >
                                        <div>
                                            <div className="text-xs font-semibold text-zinc-200 truncate max-w-[120px]">{d.name}</div>
                                            <div className="text-[10px] text-zinc-500 font-mono">{d.symbol}</div>
                                        </div>
                                        <div className={`text-xs font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {up ? '+' : ''}{d.changePercent?.toFixed(2)}%
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {pinnedQuote && (
                            <button onClick={() => setPinnedQuote(null)} className="mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 text-center">
                                Clear current overlay
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Pinned quote card overlay */}
            {pinnedQuote && !quoteOpen && (
                <div className="absolute bottom-14 right-4 z-40 bg-zinc-950/95 backdrop-blur border border-zinc-800 rounded-xl px-4 py-3 min-w-[200px] shadow-2xl">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-xs text-zinc-500 font-mono mb-0.5">{pinnedQuote.symbol}</div>
                            <div className="text-sm font-semibold text-zinc-100 leading-tight max-w-[160px]">{pinnedQuote.name}</div>
                            <div className="text-2xl font-bold font-mono text-white mt-1">
                                {typeof pinnedQuote.price === 'number' ? pinnedQuote.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : pinnedQuote.price}
                            </div>
                            <div className={`text-sm font-mono font-bold mt-0.5 ${pinnedQuote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pinnedQuote.changePercent >= 0 ? '▲' : '▼'} {Math.abs(pinnedQuote.changePercent).toFixed(2)}%
                            </div>
                        </div>
                        <button onClick={() => setPinnedQuote(null)} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 mt-0.5">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

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
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">Q</kbd>
                        <span className="text-zinc-400">quote</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">I</kbd>
                        <span className="text-zinc-400">index view</span>
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
