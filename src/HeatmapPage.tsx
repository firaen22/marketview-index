import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Loader2, RefreshCcw, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import MarketHeatmap from './MarketHeatmap';
import { TimeRangeSelector } from './components/TimeRangeSelector';
import { cn, getSettings, setSetting } from './utils';
import type { IndexData } from './types';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useMarketData } from './hooks/useMarketData';
import { getLocale } from './locales';

const HeatmapLegend = () => (
    <div className="flex items-center gap-1 mt-6 justify-center bg-zinc-950/50 py-2 px-4 rounded-full border border-zinc-800/80 w-max mx-auto shadow-lg">
        <span className="text-[10px] text-zinc-500 mr-2 font-mono font-bold">-3%</span>
        {['#b91c1c', '#ef4444', '#fb7185', '#27272a', '#34d399', '#10b981', '#059669'].map(c => (
            <div key={c} className="w-8 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
        ))}
        <span className="text-[10px] text-zinc-500 ml-2 font-mono font-bold">+3%</span>
    </div>
);

export default function HeatmapPage() {
    const [viewMode, setViewMode] = useState<'category' | 'subCategory'>('category');
    const [viewSource, setViewSource] = useState<'market' | 'funds'>('market');
    const [timeRange, setTimeRange] = useState<string>('YTD');
    const [language, setLanguage] = useState<'en' | 'zh-TW'>(() => getSettings().lang);

    useSettingsSync(({ lang }) => {
        if (lang) setLanguage(lang);
    });

    const { data: marketData, isLoading, refresh: fetchData } = useMarketData({ range: timeRange });

    // Handle initial view source sync
    useEffect(() => {
        if (viewSource === 'funds') {
            setViewMode('subCategory');
        } else {
            setViewMode('category');
        }
    }, [viewSource]);

    const filteredData = React.useMemo(() => {
        if (viewSource === 'market') {
            return marketData.filter(item => item.category !== 'Fund');
        }
        return marketData.filter(item => item.category === 'Fund');
    }, [marketData, viewSource]);

    const t = getLocale(language).heatmapPage;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 lg:p-8 font-sans">
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-zinc-800 pb-8">
                <div className="flex items-center gap-4">
                    <Link
                        to="/"
                        className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors duration-500",
                                viewSource === 'market' ? "bg-emerald-600 shadow-emerald-900/20" : "bg-indigo-600 shadow-indigo-900/20"
                            )}>
                                <LayoutDashboard className="text-white w-6 h-6" />
                            </div>
                            <span className={cn(
                                "bg-gradient-to-br bg-clip-text text-transparent transition-all duration-500",
                                viewSource === 'market' ? "from-emerald-400 to-cyan-400" : "from-indigo-400 to-purple-400"
                            )}>
                                {t.title}
                            </span>
                        </h1>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* View Source Toggle */}
                    <div className="flex items-center bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
                        <button
                            onClick={() => setViewSource('market')}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300",
                                viewSource === 'market'
                                    ? "bg-emerald-600 text-white shadow-lg"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            )}
                        >
                            {t.sourceMarket}
                        </button>
                        <button
                            onClick={() => setViewSource('funds')}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300",
                                viewSource === 'funds'
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            )}
                        >
                            {t.sourceFunds}
                        </button>
                    </div>

                    <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

                    <div className="flex items-center bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
                        <button
                            onClick={() => setViewMode('category')}
                            disabled={viewSource === 'funds'}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                                viewMode === 'category'
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "text-zinc-500 hover:text-zinc-300",
                                viewSource === 'funds' && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            {t.category}
                        </button>
                        <button
                            onClick={() => setViewMode('subCategory')}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                                viewMode === 'subCategory'
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {t.subCategory}
                        </button>
                    </div>

                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} variant="default" />

                    <button
                        onClick={() => {
                            const nextLang = language === 'en' ? 'zh-TW' : 'en';
                            setLanguage(nextLang);
                            setSetting('lang', nextLang);
                        }}
                        className="p-1 px-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-[10px] font-bold text-zinc-300 hover:text-white transition-all flex items-center justify-center min-w-[40px]"
                    >
                        {language === 'en' ? 'EN' : '中文'}
                    </button>

                    <button
                        onClick={() => fetchData(true)}
                        className={cn(
                            "p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all",
                            isLoading && "animate-spin"
                        )}
                        disabled={isLoading}
                    >
                        <RefreshCcw size={18} />
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[500px] text-zinc-600">
                        <Loader2 className="w-12 h-12 animate-spin mb-4 opacity-50 text-emerald-500" />
                        <p className="font-medium animate-pulse text-lg">{t.loading}</p>
                    </div>
                ) : (
                    <div className="animate-in fade-in zoom-in duration-500">
                        <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-3xl p-6 backdrop-blur-sm relative overflow-hidden min-h-[750px] transition-all duration-500">
                            {/* Decorative glow */}
                            <div className={cn(
                                "absolute -top-24 -left-24 w-64 h-64 rounded-full blur-[100px] pointer-events-none transition-colors duration-500",
                                viewSource === 'market' ? "bg-emerald-500/10" : "bg-indigo-500/10"
                            )} />
                            <div className={cn(
                                "absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-[100px] pointer-events-none transition-colors duration-500",
                                viewSource === 'market' ? "bg-cyan-500/10" : "bg-purple-500/10"
                            )} />

                            <div className="h-[650px] w-full">
                                <MarketHeatmap rawData={filteredData} groupBy={viewMode} />
                            </div>

                            <HeatmapLegend />

                            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {filteredData.map((item) => (
                                    <div key={item.symbol} className="bg-zinc-900/40 border border-zinc-800/50 p-3 rounded-xl flex items-center justify-between hover:border-zinc-700 transition-colors">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter truncate">{item.symbol}</span>
                                            <span className="text-[11px] font-semibold truncate text-zinc-200" title={item.name}>{language === 'en' ? (item.nameEn || item.name) : item.name}</span>
                                        </div>
                                        <div className={cn(
                                            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ml-2 shrink-0",
                                            item.changePercent >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                        )}>
                                            {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
