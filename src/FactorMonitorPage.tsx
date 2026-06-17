import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Radio, Loader2, RefreshCcw, ExternalLink, AlertTriangle, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LangToggle } from './components/LangToggle';
import { cn } from './utils';
import { getSettings, setSetting } from './settings';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useMarketData } from './hooks/useMarketData';
import { useMacroData } from './hooks/useMacroData';
import type { IndexData, MacroData } from './types';

/**
 * PROTOTYPE — Podcast Factor Monitor.
 *
 * Reads the latest investment-podcast Patreon note (live API when configured,
 * sample otherwise), shows the factors the host is emphasizing, and renders a
 * live value for each factor that maps to a series this app already tracks.
 */

type Category = 'Liquidity' | 'Inflation' | 'Growth' | 'Breadth' | 'Valuation' | 'Sentiment' | 'Other';

interface Factor {
    label: string;
    category: Category;
    rationale: string;
    symbol: string | null;
}

interface FactorResponse {
    success: boolean;
    source: string;
    note?: string;
    extraction: 'ai' | 'heuristic';
    post: { title: string; excerpt: string; url: string; publishedAt: string };
    factors: Factor[];
}

const CATEGORY_COLORS: Record<Category, string> = {
    Liquidity: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    Inflation: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    Growth: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    Breadth: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    Valuation: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    Sentiment: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    Other: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
};

export default function FactorMonitorPage() {
    const [language, setLanguage] = useState<'en' | 'zh-TW'>(() => getSettings().lang);
    useSettingsSync(({ lang }) => { if (lang) setLanguage(lang); });

    const [resp, setResp] = useState<FactorResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { data: marketData } = useMarketData({ range: 'YTD', lang: language, refreshMs: 60 * 60 * 1000 });
    const { data: macroData } = useMacroData({ lang: language, refreshMs: 60 * 60 * 1000 });

    const fetchFactors = useCallback(async (force = false, signal?: AbortSignal) => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (force) params.set('refresh', 'true');
            const geminiKey = getSettings().geminiKey;
            const headers: Record<string, string> = {};
            if (geminiKey) headers.Authorization = `Bearer ${geminiKey}`;
            const r = await fetch(`/api/patreon-posts?${params.toString()}`, { headers, signal });
            const j: FactorResponse = await r.json();
            if (!j.success) throw new Error('Request failed');
            setResp(j);
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            setError((err as Error).message);
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchFactors(false, controller.signal);
        return () => controller.abort();
    }, [fetchFactors]);

    // Resolve a factor's tracked symbol to a live value + % change.
    const resolveLive = (symbol: string | null): { label: string; value: string; changePercent: number | null } | null => {
        if (!symbol) return null;
        const m: IndexData | undefined = marketData.find((d) => d.symbol === symbol);
        if (m) {
            const name = language === 'en' ? (m.nameEn || m.name) : m.name;
            return { label: name, value: m.price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—', changePercent: m.changePercent };
        }
        const mac: MacroData | undefined = macroData.find((d) => d.symbol === symbol);
        if (mac) {
            const name = language === 'en' ? mac.nameEn : mac.name;
            return { label: name, value: mac.value?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—', changePercent: mac.changePercent };
        }
        return null;
    };

    const isZh = language === 'zh-TW';
    const isSample = resp?.source?.startsWith('sample');

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 lg:p-8 font-sans">
            <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-zinc-800 pb-6">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-black tracking-tighter flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-fuchsia-600 shadow-lg shadow-fuchsia-900/20">
                                <Radio className="text-white w-5 h-5" />
                            </div>
                            <span className="bg-gradient-to-br from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                                {isZh ? 'Podcast 因子監測' : 'Podcast Factor Monitor'}
                            </span>
                        </h1>
                        <p className="text-xs text-zinc-500 mt-1 ml-1">
                            {isZh ? '追蹤主持人本週強調的宏觀／市場因子' : "Tracking the factors the host is emphasizing this week"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <LangToggle
                        language={language}
                        onChange={(next) => { setLanguage(next); setSetting('lang', next); }}
                        className="p-1 px-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-[10px] font-bold text-zinc-300 hover:text-white transition-all flex items-center justify-center min-w-[40px]"
                    />
                    <button
                        onClick={() => fetchFactors(true)}
                        disabled={isLoading}
                        className={cn('p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all', isLoading && 'animate-spin')}
                    >
                        <RefreshCcw size={18} />
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto">
                {isLoading && !resp ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-zinc-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-fuchsia-500/70" />
                        <p className="animate-pulse">{isZh ? '讀取 Patreon 貼文與因子…' : 'Reading Patreon post & extracting factors…'}</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-rose-400">
                        <AlertTriangle className="w-8 h-8 mb-3" />
                        <p>{error}</p>
                    </div>
                ) : resp ? (
                    <div className="animate-in fade-in duration-500 space-y-6">
                        {/* Source banner */}
                        <div className={cn(
                            'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm',
                            isSample ? 'bg-amber-500/5 border-amber-500/30 text-amber-300/90' : 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300/90'
                        )}>
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                                <span className="font-semibold mr-2">
                                    {isSample
                                        ? (isZh ? '示範資料' : 'Sample data')
                                        : (isZh ? 'Patreon 即時' : 'Live from Patreon')}
                                </span>
                                <span className="opacity-80">{resp.note || (isZh ? '已從 Patreon 取得最新貼文。' : 'Latest post fetched from Patreon.')}</span>
                            </div>
                        </div>

                        {/* Latest post */}
                        <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                                    {isZh ? '最新貼文' : 'Latest post'} · {new Date(resp.post.publishedAt).toLocaleDateString()}
                                </span>
                                <a href={resp.post.url} target="_blank" rel="noreferrer" className="text-xs text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1">
                                    {isZh ? '原文' : 'Open'} <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                            <h2 className="text-lg font-bold text-zinc-100 mb-2">{resp.post.title}</h2>
                            <p className="text-sm text-zinc-400 leading-relaxed">{resp.post.excerpt}{resp.post.excerpt.length >= 600 ? '…' : ''}</p>
                        </div>

                        {/* Factors */}
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                {isZh ? '強調的因子' : 'Emphasized factors'}
                                <span className="text-[10px] font-medium normal-case px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-400 flex items-center gap-1">
                                    {resp.extraction === 'ai' ? <Sparkles className="w-3 h-3 text-fuchsia-400" /> : null}
                                    {resp.extraction === 'ai' ? (isZh ? 'AI 擷取' : 'AI-extracted') : (isZh ? '關鍵字' : 'keyword')}
                                </span>
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {resp.factors.map((f, i) => {
                                const live = resolveLive(f.symbol);
                                return (
                                    <div key={i} className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', CATEGORY_COLORS[f.category])}>
                                                {f.category}
                                            </span>
                                        </div>
                                        <div className="font-bold text-zinc-100 leading-tight">{f.label}</div>
                                        <p className="text-xs text-zinc-500 leading-relaxed flex-1">{f.rationale}</p>

                                        {live ? (
                                            <div className="mt-1 pt-3 border-t border-zinc-800/80 flex items-end justify-between">
                                                <div className="min-w-0">
                                                    <div className="text-[9px] uppercase tracking-wider text-zinc-600 truncate">{live.label}</div>
                                                    <div className="font-mono font-bold text-zinc-100">{live.value}</div>
                                                </div>
                                                {live.changePercent !== null && (
                                                    <div className={cn(
                                                        'flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded-md',
                                                        live.changePercent > 0 ? 'bg-emerald-500/10 text-emerald-400' : live.changePercent < 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-700/30 text-zinc-400'
                                                    )}>
                                                        {live.changePercent > 0 ? <TrendingUp className="w-3 h-3" /> : live.changePercent < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                                        {live.changePercent > 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-1 pt-3 border-t border-zinc-800/80 text-[10px] text-zinc-600 italic">
                                                {isZh ? '無對應追蹤數據（僅監測敘事）' : 'No tracked series — narrative watch only'}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
