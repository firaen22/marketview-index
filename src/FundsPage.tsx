import React, { useState, useEffect } from 'react';
import { Wallet, LayoutDashboard, Loader2, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './Dashboard';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import MarketHeatmap from './MarketHeatmap';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function FundsPage() {
    const [marketData, setMarketData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [language, setLanguage] = useState<'en' | 'zh-TW'>(() => {
        const saved = localStorage.getItem('marketflow_lang');
        return (saved === 'en' || saved === 'zh-TW') ? saved : 'zh-TW';
    });
    const [timeRange, setTimeRange] = useState<string>('YTD');

    const [chartMode, setChartMode] = useState<'nominal' | 'percent'>(() => {
        const saved = localStorage.getItem('marketflow_chart_mode');
        return (saved === 'nominal' || saved === 'percent') ? saved : 'nominal';
    });

    const fetchFunds = async (currentRange = timeRange, force = false) => {
        setIsLoading(true);
        try {
            const url = `/api/market-data?range=${currentRange}${force ? '&refresh=true' : ''}`;
            const response = await fetch(url);
            const result = await response.json();
            if (result.success) {
                setMarketData(result.data.filter((item: any) => item.category === 'Fund'));
            }
        } catch (err) {
            console.error('Failed to fetch funds:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFunds(timeRange);
    }, [timeRange]);

    const indexNames = marketData.reduce((acc: any, fund: any) => {
        acc[fund.name] = language === 'en' ? (fund.nameEn || fund.name) : fund.name;
        return acc;
    }, {});

    const t = {
        title: language === 'en' ? 'Wealth Management' : '財富管理基金',
        back: language === 'en' ? 'Back to Market' : '回到市場大盤',
        ytd: language === 'en' ? 'YTD Change' : '年初至今',
        loading: language === 'en' ? 'Loading funds...' : '正在讀取基金數據...',
        nominal: language === 'en' ? 'Nominal' : '數值模式',
        percent: language === 'en' ? 'Percent' : '百分比模式',
        rangeLabels: {
            '1M': language === 'en' ? '1 Month' : '1個月漲跌',
            '3M': language === 'en' ? '3 Months' : '3個月漲跌',
            'YTD': language === 'en' ? 'YTD Change' : '今年至今',
            '1Y': language === 'en' ? '1 Year' : '1年漲跌'
        },
        indexNames
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 lg:p-8 font-sans">
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-zinc-800 pb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <Wallet className="text-white w-6 h-6" />
                        </div>
                        <span className="bg-gradient-to-br from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {t.title}
                        </span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md mr-2">
                        {['1M', '3M', 'YTD', '1Y'].map(range => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all duration-200",
                                    timeRange === range
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                )}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            const nextMode = chartMode === 'nominal' ? 'percent' : 'nominal';
                            setChartMode(nextMode);
                            localStorage.setItem('marketflow_chart_mode', nextMode);
                        }}
                        className="px-4 py-2.5 text-sm font-bold bg-zinc-900/50 backdrop-blur-md rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all text-zinc-300 hover:text-white"
                    >
                        {chartMode === 'nominal' ? t.nominal : t.percent}
                    </button>
                    <button
                        onClick={() => {
                            const nextLang = language === 'en' ? 'zh-TW' : 'en';
                            setLanguage(nextLang);
                            localStorage.setItem('marketflow_lang', nextLang);
                        }}
                        className="px-4 py-2.5 text-sm font-bold bg-zinc-900/50 backdrop-blur-md rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all text-zinc-300 hover:text-white"
                    >
                        {language === 'en' ? 'EN' : '中文'}
                    </button>
                    <button
                        onClick={() => fetchFunds(timeRange, true)}
                        className={cn(
                            "p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all",
                            isLoading && "animate-spin"
                        )}
                        disabled={isLoading}
                    >
                        <RefreshCcw size={18} />
                    </button>
                    <Link
                        to="/"
                        className="group flex items-center gap-2.5 text-sm bg-zinc-900/50 backdrop-blur-md px-5 py-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all shadow-xl"
                    >
                        <LayoutDashboard size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="font-bold">{t.back}</span>
                    </Link>
                </div>
            </header>

            <main className="max-w-7xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 opacity-50" />
                        <p className="font-medium animate-pulse">{t.loading}</p>
                    </div>
                ) : (
                    <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h3 className="text-xl font-bold mb-4 flex items-center text-zinc-200">
                            <LayoutDashboard className="w-5 h-5 mr-2 text-indigo-400" />
                            {language === 'en' ? 'Asset Allocation Heatmap' : '資產配置熱圖'}
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
                                        t={{
                                            ytd: t.ytd,
                                            range: "Day Range",
                                            indexNames: t.indexNames,
                                            language,
                                            activeRange: timeRange,
                                            rangeLabels: t.rangeLabels
                                        }}
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
