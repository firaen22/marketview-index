import { TrendingUp, TrendingDown, Clock, RefreshCcw, LayoutDashboard, Loader2, AlertCircle, Settings, Newspaper, Wallet, MonitorPlay, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TickerItem } from './TickerItem';
import { LangToggle } from './LangToggle';
import { cn } from '../utils';
import type { IndexData } from '../types';
import type { TDict } from '../locales';

interface Props {
    t: TDict;
    language: 'en' | 'zh-TW';
    lastUpdated: Date | null;
    currentTime: Date;
    isLoading: boolean;
    isError: boolean;
    isNewsLoading: boolean;
    isNewsOnly: boolean;
    chartMode: 'nominal' | 'percent';
    geminiKey: string;
    tickerDisplay: IndexData[];
    onToggleNews: () => void;
    onLangChange: (lang: 'en' | 'zh-TW') => void;
    onOpenSettings: () => void;
    onToggleChartMode: () => void;
    onRefresh: () => void;
    onOpenTickerConfig: () => void;
}

export function DashboardHeader({
    t, language, lastUpdated, currentTime,
    isLoading, isError, isNewsLoading, isNewsOnly,
    chartMode, geminiKey, tickerDisplay,
    onToggleNews, onLangChange, onOpenSettings,
    onToggleChartMode, onRefresh, onOpenTickerConfig,
}: Props) {
    return (
        <header className="border-b border-zinc-800 bg-black/40 backdrop-blur-xl sticky top-0 z-[100]">
            <div className="container mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <TrendingUp className="text-white w-5 h-5" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <h1 className="text-xl font-black tracking-tighter text-zinc-100 flex items-center">
                            <span className="bg-gradient-to-br from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                                {t.title}
                            </span>
                        </h1>
                        <div className="flex items-center text-[10px] text-zinc-500 mt-0.5">
                            {lastUpdated ? (
                                <>
                                    <span className="opacity-70 mr-1">{t.lastUpdated}:</span>
                                    {lastUpdated.toLocaleString(language === 'zh-TW' ? 'zh-TW' : undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </>
                            ) : (
                                <span className="opacity-70">{t.awaitingData}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="flex items-center font-mono text-zinc-300 text-[11px] px-3 py-1 bg-zinc-900/50 rounded-full border border-zinc-800">
                        <Clock className="w-3 h-3 mr-1.5 text-blue-500" />
                        {currentTime.toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : undefined)}
                    </div>
                    <div className="flex items-center space-x-1 border border-zinc-800 rounded-full p-1 bg-zinc-950/50">
                        <button
                            onClick={onToggleNews}
                            className={cn(
                                "p-1 px-2.5 rounded-full transition-all text-[10px] font-bold flex items-center gap-1.5",
                                isNewsOnly ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                            )}
                            title={isNewsOnly ? t.allIndices : t.newsOnly}
                        >
                            <Newspaper className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isNewsOnly ? t.allIndices : t.newsOnly}</span>
                        </button>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <LangToggle
                            language={language}
                            onChange={onLangChange}
                            className="p-1 px-2.5 hover:bg-zinc-800 rounded-full transition-all text-[10px] font-bold text-zinc-300 hover:text-white"
                        />
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <button
                            onClick={onOpenSettings}
                            className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100 relative"
                            title={t.settings}
                        >
                            <Settings className="w-4 h-4" />
                            {geminiKey && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full border border-zinc-950" />}
                        </button>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <button
                            onClick={onToggleChartMode}
                            className="p-1 px-2.5 hover:bg-zinc-800 rounded-full transition-all text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1.5"
                            title={t.chartModeLabel}
                        >
                            {chartMode === 'nominal' ? (
                                <>
                                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                    <span>{t.nominal}</span>
                                </>
                            ) : (
                                <>
                                    <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>{t.percent}</span>
                                </>
                            )}
                        </button>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <Link
                            to="/funds"
                            className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100"
                            title={t.funds}
                        >
                            <Wallet className="w-4 h-4" />
                        </Link>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <Link
                            to="/heatmap"
                            className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100"
                            title={t.heatmap}
                        >
                            <LayoutDashboard className="w-4 h-4" />
                        </Link>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <Link
                            to="/present"
                            className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-emerald-400"
                            title="Presentation View"
                        >
                            <MonitorPlay className="w-4 h-4" />
                        </Link>
                        <div className="h-3 w-px bg-zinc-800"></div>
                        <Link
                            to="/present-control"
                            className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md text-emerald-400 transition-all text-xs font-semibold"
                            title="Open Presentation Control"
                        >
                            <span>Control</span>
                        </Link>
                    </div>
                    <button
                        onClick={onRefresh}
                        className={cn("p-2 hover:bg-zinc-900 rounded-full transition-all text-zinc-400 hover:text-zinc-100", (isLoading || isNewsLoading) && "animate-spin")}
                        disabled={isLoading || isNewsLoading}
                        title={t.refresh}
                    >
                        <RefreshCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Ticker Tape */}
            <div className="relative overflow-hidden whitespace-nowrap border-b border-zinc-800 bg-zinc-950 flex items-center h-12">
                {isLoading ? (
                    <div className="w-full flex items-center justify-center text-xs text-zinc-500">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.loading}
                    </div>
                ) : isError && tickerDisplay.length === 0 ? (
                    <div className="w-full flex items-center justify-center text-xs text-rose-500">
                        <AlertCircle className="w-4 h-4 mr-2" /> {t.error}
                    </div>
                ) : (
                    <div className="inline-flex animate-ticker" aria-label="Market ticker">
                        {tickerDisplay.map((index) => (
                            <TickerItem key={index.symbol} item={index} t={t} />
                        ))}
                        {/* Duplicate for seamless CSS -50% translate loop — aria-hidden keeps screen readers clean */}
                        <span aria-hidden="true" className="inline-flex">
                            {tickerDisplay.map((index) => (
                                <TickerItem key={`${index.symbol}-dup`} item={index} t={t} />
                            ))}
                        </span>
                    </div>
                )}
                <button
                    onClick={onOpenTickerConfig}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-emerald-400 transition"
                    title={t.tickerConfig?.open || 'Configure ticker'}
                >
                    <ListChecks className="w-3.5 h-3.5" />
                </button>
            </div>
        </header>
    );
}
