import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Loader2, RefreshCcw, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import MarketHeatmap from './MarketHeatmap';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function HeatmapPage() {
    const [marketData, setMarketData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'category' | 'subCategory'>('category');
    const [timeRange, setTimeRange] = useState<string>('YTD');
    const [language] = useState<'en' | 'zh-TW'>(() => {
        const saved = localStorage.getItem('marketflow_lang');
        return (saved === 'en' || saved === 'zh-TW') ? saved : 'zh-TW';
    });

    const fetchData = async (currentRange = timeRange, force = false) => {
        setIsLoading(true);
        try {
            const url = `/api/market-data?range=${currentRange}${force ? '&refresh=true' : ''}`;
            const response = await fetch(url);
            const result = await response.json();
            if (result.success) {
                setMarketData(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData(timeRange);
    }, [timeRange]);

    const t = {
        title: language === 'en' ? 'Market Heatmap Explorer' : '市場熱圖探測器',
        back: language === 'en' ? 'Back to Dashboard' : '回到儀表板',
        loading: language === 'en' ? 'Loading market data...' : '正在讀取市場數據...',
        refresh: language === 'en' ? 'Refresh' : '重新整理',
        category: language === 'en' ? 'By Category' : '按類別分組',
        subCategory: language === 'en' ? 'By Sub-Category' : '按子類別分組',
    };

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
                            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/20">
                                <LayoutDashboard className="text-white w-6 h-6" />
                            </div>
                            <span className="bg-gradient-to-br from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                {t.title}
                            </span>
                        </h1>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
                        <button
                            onClick={() => setViewMode('category')}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                                viewMode === 'category'
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            )}
                        >
                            {t.category}
                        </button>
                        <button
                            onClick={() => setViewMode('subCategory')}
                            className={cn(
                                "px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                                viewMode === 'subCategory'
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            )}
                        >
                            {t.subCategory}
                        </button>
                    </div>

                    <div className="flex items-center bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
                        {['1M', '3M', 'YTD', '1Y'].map(range => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all duration-200",
                                    timeRange === range
                                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                )}
                            >
                                {range}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => fetchData(timeRange, true)}
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
                        <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-3xl p-6 backdrop-blur-sm relative overflow-hidden">
                            {/* Decorative glow */}
                            <div className="absolute -top-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
                            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

                            <div className="h-[650px] w-full">
                                <MarketHeatmap rawData={marketData} groupBy={viewMode} />
                            </div>

                            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {marketData.slice(0, 10).map((item) => (
                                    <div key={item.symbol} className="bg-zinc-900/40 border border-zinc-800 p-3 rounded-xl flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase">{item.symbol}</span>
                                            <span className="text-xs font-semibold truncate max-w-[80px]">{item.name}</span>
                                        </div>
                                        <div className={cn(
                                            "text-xs font-mono font-bold px-1.5 py-0.5 rounded",
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
