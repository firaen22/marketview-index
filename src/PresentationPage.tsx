import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { getSettings, deletePdf, type PresentSlideMode } from './utils';
import { useSlideSync } from './hooks/useSlideSync';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useClock } from './hooks/useClock';
import { PdfUploader } from './components/PdfUploader';
import enLocale from './locales/en.ts';
import zhLocale from './locales/zh-TW.ts';
import { Pencil, Maximize2, Minimize2, ExternalLink, X, Keyboard, LayoutGrid, Rows3, EyeOff, LayoutDashboard, Presentation, TrendingUp } from 'lucide-react';
import { TickerItem } from './components/TickerItem';
import { Link } from 'react-router-dom';
import type { IndexData } from './types';
import { useMarketData } from './hooks/useMarketData';

type StripMode = 'compact' | 'full' | 'hidden';
const STRIP_MODES: StripMode[] = ['compact', 'full', 'hidden'];

export default function PresentationPage() {
    const { slide, saveSlide, doRemoteSave, cloudStatus, lastSavedAt, sizeWarning, formatRelativeTime } = useSlideSync();
    const initialSettings = React.useMemo(() => getSettings(), []);
    const [editorOpen, setEditorOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHints, setShowHints] = useState(false);
    const [stripMode, setStripMode] = useState<StripMode>('compact');
    const [pdfZoom, setPdfZoom] = useState(100);
    const [mainView, setMainView] = useState<'slide' | 'index'>('slide');
    const [quoteOpen, setQuoteOpen] = useState(false);
    const [pinnedQuotes, setPinnedQuotes] = useState<IndexData[]>([]);
    const clock = useClock();
    const [lang, setLang] = useState<'en' | 'zh-TW'>(initialSettings.lang);
    const [tickerSymbols, setTickerSymbols] = useState<string[] | null>(initialSettings.tickerSymbols);
    const hintsTimerRef = useRef<number | null>(null);

    useSettingsSync(({ lang: nextLang, tickerSymbols: nextSymbols }) => {
        if (nextLang) setLang(nextLang);
        if (nextSymbols !== undefined) setTickerSymbols(nextSymbols);
    });

    const t = { ...(lang === 'zh-TW' ? zhLocale : enLocale), language: lang, activeRange: 'YTD' };

    const { data: marketData } = useMarketData({ range: 'YTD', lang, refreshMs: 10 * 60 * 1000 });

    // Auto-show hints overlay briefly on first mount, then auto-hide
    useEffect(() => {
        setShowHints(true);
        hintsTimerRef.current = window.setTimeout(() => setShowHints(false), 4500);
        return () => {
            if (hintsTimerRef.current) clearTimeout(hintsTimerRef.current);
        };
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
                setPinnedQuotes([]);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleFullscreen]);

    const pinnedRaw = tickerSymbols !== null
        ? marketData.filter(d => tickerSymbols.includes(d.symbol))
        : marketData;
    const pinned = pinnedRaw.length > 0 ? pinnedRaw : marketData;

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
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${quoteOpen || pinnedQuotes.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
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

            {/* Scrolling ticker strip */}
            {stripMode === 'compact' && (
                <div className="border-b border-zinc-900 bg-zinc-950/50 overflow-hidden relative h-9 flex items-center">
                    {pinned.length > 0 ? (
                        <div className="inline-flex animate-ticker whitespace-nowrap">
                            {pinned.map((item) => <TickerItem key={item.symbol} item={item} t={t} />)}
                            <span aria-hidden="true" className="inline-flex">
                                {pinned.map((item) => <TickerItem key={`${item.symbol}-dup`} item={item} t={t} />)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-xs text-zinc-600 px-8">Loading…</span>
                    )}
                </div>
            )}

            {/* Card grid strip */}
            {stripMode === 'full' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 px-8 py-6 border-b border-zinc-900">
                    {pinned.length > 0
                        ? pinned.map((item) => (
                            <MarketStatCard key={item.symbol} item={item} t={t} chartHeight="h-16" />
                        ))
                        : Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-36 rounded-xl bg-zinc-900/40 animate-pulse" />
                        ))}
                </div>
            )}

            {/* Slide area */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Main slide / index area */}
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

                    {/* Index hint — shown on PDF slide to surface the toggle */}
                    {mainView === 'slide' && slide.mode === 'pdf' && slide.content && (
                        <div className="absolute top-3 left-3 z-20 pointer-events-none">
                            <span className="text-[10px] font-mono text-zinc-600 bg-black/60 px-2 py-0.5 rounded">
                                Press <kbd className="text-emerald-500">I</kbd> or click <kbd className="text-emerald-500">⊞</kbd> to toggle index
                            </span>
                        </div>
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

                {/* Pinned quote panel — vertical right column */}
                {pinnedQuotes.length > 0 && !quoteOpen && (
                    <div className="w-44 flex flex-col border-l border-zinc-900 bg-zinc-950 overflow-y-auto shrink-0">
                        {pinnedQuotes.map((q, i) => (
                            <div key={q.symbol} className={`flex flex-col gap-1 px-3 py-4 ${i > 0 ? 'border-t border-zinc-900' : ''}`}>
                                <div className="flex items-start justify-between gap-1">
                                    <div className="text-[10px] text-zinc-500 font-mono leading-none">{q.symbol}</div>
                                    <button
                                        onClick={() => setPinnedQuotes(prev => prev.filter(p => p.symbol !== q.symbol))}
                                        className="p-0.5 rounded hover:bg-zinc-800 text-zinc-700 hover:text-zinc-400 shrink-0"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                                <div className="text-[11px] text-zinc-400 leading-tight">{q.name}</div>
                                <div className="text-xl font-bold font-mono text-white leading-none mt-1">
                                    {typeof q.price === 'number' ? q.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : q.price}
                                </div>
                                <div className={`text-xs font-mono font-bold ${q.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {q.changePercent >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                                </div>
                            </div>
                        ))}
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => doRemoteSave()}
                            disabled={cloudStatus === 'saving'}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition
                                ${cloudStatus === 'saving' ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                                : cloudStatus === 'ok' ? 'bg-emerald-600 text-white'
                                : cloudStatus === 'error' ? 'bg-rose-600 text-white hover:bg-rose-500'
                                : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'}`}
                        >
                            {cloudStatus === 'saving' ? '↑ Saving…'
                                : cloudStatus === 'ok' ? '✓ Saved'
                                : cloudStatus === 'error' ? '✕ Retry'
                                : '↑ Save'}
                        </button>
                        <button
                            onClick={() => setEditorOpen(false)}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-500"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
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
                            onClick={() => {
                                if (slide.mode === 'pdf' && slide.content) deletePdf(slide.content);
                                saveSlide({ mode: 'markdown', content: '' });
                            }}
                            className="text-xs px-2 py-1.5 bg-rose-900/60 border border-rose-800/50 rounded text-rose-300 hover:bg-rose-800/60"
                            title="Clear content and reset to Markdown mode"
                        >
                            Reset
                        </button>
                    </div>

                    {/* PDF uploader or textarea */}
                    {slide.mode === 'pdf' ? (
                        <div className="flex flex-col gap-3 flex-1">
                            <PdfUploader onUploaded={url => {
                                if (slide.mode === 'pdf' && slide.content && slide.content !== url) {
                                    deletePdf(slide.content);
                                }
                                saveSlide({ content: url });
                            }} />
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
                    {sizeWarning && (
                        <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
                            {sizeWarning}
                        </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>
                            {slide.content.length} chars
                            {lastSavedAt ? ` · saved ${formatRelativeTime(lastSavedAt)}` : ' · not yet saved'}
                        </span>
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
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[460px] p-4 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-baseline gap-2">
                                <span className="text-xs font-mono tracking-widest text-zinc-400">QUICK QUOTES</span>
                                <span className="text-[10px] text-zinc-600">{pinnedQuotes.length} pinned</span>
                            </div>
                            <button onClick={() => setQuoteOpen(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                            {marketData.map(d => {
                                const up = d.changePercent >= 0;
                                const isPinned = pinnedQuotes.some(p => p.symbol === d.symbol);
                                return (
                                    <button
                                        key={d.symbol}
                                        onClick={() => setPinnedQuotes(prev =>
                                            prev.some(p => p.symbol === d.symbol)
                                                ? prev.filter(p => p.symbol !== d.symbol)
                                                : [...prev, d]
                                        )}
                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border transition text-left ${
                                            isPinned
                                                ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20'
                                                : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
                                        }`}
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
                        {pinnedQuotes.length > 0 && (
                            <button onClick={() => setPinnedQuotes([])} className="mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 text-center">
                                Clear all pinned ({pinnedQuotes.length})
                            </button>
                        )}
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
