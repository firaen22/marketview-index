import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { getSettings } from './utils';
import { useSlideSync } from './hooks/useSlideSync';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useClock } from './hooks/useClock';
import { getLocale } from './locales';
import { Pencil, Maximize2, Minimize2, ExternalLink, Keyboard, LayoutGrid, Rows3, EyeOff, LayoutDashboard, Presentation, TrendingUp } from 'lucide-react';
import { TickerItem } from './components/TickerItem';
import { Link } from 'react-router-dom';
import type { IndexData } from './types';
import { STRIP_MODES, type StripMode } from './constants';
import { useMarketData } from './hooks/useMarketData';
import { QuotePanel } from './components/QuotePanel';
import { QuotePickerModal } from './components/QuotePickerModal';
import { IndexChartModal } from './components/IndexChartModal';
import { SlideEditorPanel } from './components/SlideEditorPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';


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
    const [chartItem, setChartItem] = useState<IndexData | null>(null);
    const clock = useClock();
    const [lang, setLang] = useState<'en' | 'zh-TW'>(initialSettings.lang);
    const [tickerSymbols, setTickerSymbols] = useState<string[] | null>(initialSettings.tickerSymbols);
    const hintsTimerRef = useRef<number | null>(null);

    useSettingsSync(({ lang: nextLang, tickerSymbols: nextSymbols }) => {
        if (nextLang) setLang(nextLang);
        if (nextSymbols !== undefined) setTickerSymbols(nextSymbols);
    });

    const t = React.useMemo(() => ({ ...getLocale(lang), language: lang, activeRange: 'YTD' as const }), [lang]);

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

    useKeyboardShortcuts({
        onEdit: useCallback(() => setEditorOpen(o => !o), []),
        onFullscreen: toggleFullscreen,
        onCycleStrip: useCallback(() => setStripMode(m => STRIP_MODES[(STRIP_MODES.indexOf(m) + 1) % STRIP_MODES.length]), []),
        onToggleView: useCallback(() => setMainView(v => v === 'slide' ? 'index' : 'slide'), []),
        onToggleQuote: useCallback(() => setQuoteOpen(o => !o), []),
        onToggleHints: useCallback(() => setShowHints(s => !s), []),
        onEscape: useCallback(() => { setEditorOpen(false); setShowHints(false); setQuoteOpen(false); setPinnedQuotes([]); setChartItem(null); }, []),
    });

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
                {!quoteOpen && (
                    <QuotePanel
                        quotes={pinnedQuotes}
                        onRemove={sym => setPinnedQuotes(prev => prev.filter(p => p.symbol !== sym))}
                        onItemClick={setChartItem}
                    />
                )}
            </div>

            {/* Slide-in editor panel */}
            <SlideEditorPanel
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                slide={slide}
                saveSlide={saveSlide}
                doRemoteSave={doRemoteSave}
                cloudStatus={cloudStatus}
                lastSavedAt={lastSavedAt}
                sizeWarning={sizeWarning}
                formatRelativeTime={formatRelativeTime}
            />

            {/* Index chart modal */}
            {chartItem && (
                <IndexChartModal
                    item={chartItem}
                    allData={marketData}
                    onClose={() => setChartItem(null)}
                    lang={lang}
                />
            )}

            {/* Quote picker overlay */}
            {quoteOpen && (
                <QuotePickerModal
                    marketData={marketData}
                    pinnedQuotes={pinnedQuotes}
                    onToggle={d => setPinnedQuotes(prev =>
                        prev.some(p => p.symbol === d.symbol)
                            ? prev.filter(p => p.symbol !== d.symbol)
                            : [...prev, d]
                    )}
                    onClearAll={() => setPinnedQuotes([])}
                    onClose={() => setQuoteOpen(false)}
                />
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
