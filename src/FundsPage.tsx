import React, { useState, useCallback } from 'react';
import { Wallet, LayoutDashboard, Loader2, RefreshCcw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './components/MarketStatCard';
import { TimeRangeSelector } from './components/TimeRangeSelector';
import { LangToggle } from './components/LangToggle';
import { cn, getSettings, setSetting } from './utils';
import MarketHeatmap from './MarketHeatmap';
import type { IndexData } from './types';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useMarketData } from './hooks/useMarketData';
import { getLocale } from './locales';

export default function FundsPage() {
    const initialSettings = React.useMemo(() => getSettings(), []);
    const [language, setLanguage] = useState<'en' | 'zh-TW'>(initialSettings.lang);
    const [timeRange, setTimeRange] = useState<string>('YTD');
    const [chartMode, setChartMode] = useState<'nominal' | 'percent'>(initialSettings.chartMode);

    const fundFilter = useCallback((item: IndexData) => item.category === 'Fund', []);
    const { data: marketData, isLoading, refresh: fetchFunds } = useMarketData({
        range: timeRange,
        filter: fundFilter,
    });

    useSettingsSync(({ lang, chartMode }) => {
        if (lang) setLanguage(lang);
        if (chartMode) setChartMode(chartMode);
    });

    const t = React.useMemo(() => {
        const baseT = getLocale(language);
        const indexNames = marketData.reduce<Record<string, string>>((acc, fund) => {
            acc[fund.name] = language === 'en' ? (fund.nameEn || fund.name) : fund.name;
            return acc;
        }, {});
        return { ...baseT, indexNames, language, activeRange: timeRange };
    }, [language, timeRange, marketData]);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 lg:p-8 font-sans">
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-zinc-800 pb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <Wallet className="text-white w-6 h-6" />
                        </div>
                        <span className="bg-gradient-to-br from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {t.fundsPage.title}
                        </span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} variant="blue" className="mr-2" />
                    <button
                        onClick={() => {
                            const nextMode = chartMode === 'nominal' ? 'percent' : 'nominal';
                            setChartMode(nextMode);
                            setSetting('chartMode', nextMode);
                        }}
                        className="px-4 py-2.5 text-sm font-bold bg-zinc-900/50 backdrop-blur-md rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all text-zinc-300 hover:text-white"
                    >
                        {chartMode === 'nominal' ? t.nominal : t.percent}
                    </button>
                    <LangToggle
                        language={language}
                        onChange={(next) => { setLanguage(next); setSetting('lang', next); }}
                        className="px-4 py-2.5 text-sm font-bold bg-zinc-900/50 backdrop-blur-md rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all text-zinc-300 hover:text-white"
                    />
                    <button
                        onClick={() => fetchFunds(true)}
                        className={cn(
                            "p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all",
                            isLoading && "animate-spin"
                        )}
                        disabled={isLoading}
                    >
                        <RefreshCcw size={18} />
                    </button>
                    <Link
                        to="/heatmap"
                        className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
                        title="Heatmap Explorer"
                    >
                        <LayoutDashboard size={18} />
                    </Link>
                    <Link
                        to="/"
                        className="group flex items-center gap-2.5 text-sm bg-zinc-900/50 backdrop-blur-md px-5 py-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all shadow-xl"
                    >
                        <ArrowLeft size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="font-bold">{t.fundsPage.back}</span>
                    </Link>
                </div>
            </header>

            <main className="max-w-7xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 opacity-50" />
                        <p className="font-medium animate-pulse">{t.fundsPage.loading}</p>
                    </div>
                ) : (
                    <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h3 className="text-xl font-bold mb-4 flex items-center text-zinc-200">
                            <LayoutDashboard className="w-5 h-5 mr-2 text-indigo-400" />
                            {t.fundsPage.heatmapTitle}
                        </h3>
                        <MarketHeatmap rawData={marketData} groupBy="subCategory" />
                    </div>
                )}
                {!isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {marketData.map((fund) => (
                            <div key={fund.symbol} className="relative group">
                                <div className="transition-transform duration-500 group-hover:-translate-y-1">
                                    <MarketStatCard
                                        item={fund}
                                        chartHeight="h-40"
                                        t={t}
                                        chartMode={chartMode}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
