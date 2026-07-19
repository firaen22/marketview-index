import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { IndexData, MarketDataResponse, TimeRange } from '../types';
import { displayName, formatPrice, formatSigned, formatWhole } from '../utils';
import { TimeRangeSelector } from './TimeRangeSelector';

interface Props {
    item: IndexData;
    allData: IndexData[];
    onClose: () => void;
    lang?: 'en' | 'zh-TW';
    initialCompareSymbols?: string[];
    /** Range the surrounding page already fetched; the modal opens on it. */
    pageRange?: TimeRange;
}

const PALETTE = ['#4a57f2', '#0d9488', '#db2777', '#ea580c', '#7c3aed'];
const MAX_COMPARE = 4;

function formatDate(v: unknown, opts: Intl.DateTimeFormatOptions): string {
    if (typeof v !== 'string' || !v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, opts);
}

const LABELS = {
    en: {
        compare: 'Compare',
        addIndex: 'Add index',
        search: 'Search indices…',
        mode: 'Mode',
        percent: '%',
        nominal: 'Nominal',
        noHistory: 'No history data available for this index.',
        limit: `Max ${MAX_COMPARE} comparisons`,
        period: 'Period',
        loading: 'Loading…',
        rangeFailed: (want: string) => `Couldn't load ${want} data. Pick another period or try again.`,
    },
    'zh-TW': {
        compare: '比較',
        addIndex: '新增指數',
        search: '搜尋指數…',
        mode: '模式',
        percent: '百分比',
        nominal: '原始值',
        noHistory: '此指數暫無歷史數據。',
        limit: `最多 ${MAX_COMPARE} 個比較`,
        period: '期間',
        loading: '載入中…',
        rangeFailed: (want: string) => `無法載入 ${want} 數據，請選擇其他期間或重試。`,
    },
};

type Series = { item: IndexData; color: string };

/**
 * History for a period other than the one the page already fetched.
 * `range === pageRange` never fetches — the caller's `allData` is that data.
 * `/api/market-data` is cached per range in Redis, so toggling between periods
 * is a warm read after the first hit.
 */
function useRangeOverride(range: TimeRange, pageRange: TimeRange, lang: 'en' | 'zh-TW') {
    const [loaded, setLoaded] = useState<{ range: TimeRange; data: IndexData[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (range === pageRange) {
            setIsLoading(false);
            setFailed(false);
            return;
        }
        const controller = new AbortController();
        setIsLoading(true);
        setFailed(false);
        (async () => {
            try {
                const params = new URLSearchParams({ range, lang });
                const res = await fetch(`/api/market-data?${params.toString()}`, { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json: MarketDataResponse = await res.json();
                if (!json.success || !Array.isArray(json.data)) throw new Error('malformed payload');
                setLoaded({ range, data: json.data });
            } catch (err) {
                if ((err as Error)?.name === 'AbortError') return;
                setFailed(true);
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        })();
        // Aborting on range change also discards the in-flight response, so a
        // slow earlier request can never overwrite a newer range's data.
        return () => controller.abort();
    }, [range, pageRange, lang]);

    return {
        data: loaded && loaded.range === range ? loaded.data : null,
        isLoading,
        failed,
    };
}

export function IndexChartModal({ item, allData, onClose, lang = 'en', initialCompareSymbols = [], pageRange = 'YTD' }: Props) {
    const L = LABELS[lang];
    const [range, setRange] = useState<TimeRange>(pageRange);
    const override = useRangeOverride(range, pageRange, lang);

    // A copilot `range`/`chart … 1Y` command moves the page range while this
    // modal is mounted; follow it rather than stranding the chart on the period
    // that was current when it opened.
    useEffect(() => { setRange(pageRange); }, [pageRange]);
    const [compareSymbols, setCompareSymbols] = useState<string[]>(() => initialCompareSymbols.slice(0, MAX_COMPARE));
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [chartMode, setChartMode] = useState<'percent' | 'nominal'>('nominal');

    const compareColor = (index: number) => PALETTE[(index + 1) % PALETTE.length];

    // Chip and line colors share one positional source: the symbol's index in
    // compareSymbols. A symbol absent from allData keeps its chip (and color
    // slot) but contributes no series.
    const comparedSeries: Series[] = useMemo(() => {
        return compareSymbols
            .map((sym, i) => {
                const d = allData.find(x => x.symbol === sym);
                return d ? { item: d, color: PALETTE[(i + 1) % PALETTE.length] } : null;
            })
            .filter((s): s is Series => s !== null);
    }, [allData, compareSymbols]);

    const hasCompare = comparedSeries.length > 0;
    const effectiveMode: 'percent' | 'nominal' = hasCompare ? 'percent' : chartMode;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (pickerOpen) setPickerOpen(false);
                else onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, pickerOpen]);

    const series: Series[] = useMemo(() => {
        return [{ item, color: PALETTE[0] }, ...comparedSeries];
    }, [item, comparedSeries]);

    // Series identity (name, colour, order) always comes from the page's data;
    // only the plotted history swaps when another period is selected. Looking
    // the history up in one source keeps every line on the same period rather
    // than silently mixing a missing symbol's page-range history back in.
    const historyFor = useMemo(() => {
        const source = override.data;
        return (s: Series) =>
            source ? (source.find(d => d.symbol === s.item.symbol)?.history ?? []) : (s.item.history || []);
    }, [override.data]);

    const chartData = useMemo(() => {
        const dateMap = new Map<string, Record<string, number | string>>();
        for (const s of series) {
            const hist = historyFor(s);
            if (hist.length === 0) continue;
            const base = hist[0].value;
            hist.forEach((pt, idx) => {
                const key = pt.date || String(idx).padStart(4, '0');
                if (!dateMap.has(key)) dateMap.set(key, { date: key });
                const row = dateMap.get(key)!;
                const val =
                    // Finite-base check: NaN/undefined base (stale cached data) must not poison the row
                    effectiveMode === 'percent' && Number.isFinite(base) && base !== 0
                        ? ((pt.value - base) / base) * 100
                        : pt.value;
                row[s.item.symbol] = val;
            });
        }
        return Array.from(dateMap.values()).sort((a, b) => {
            const da = typeof a.date === 'string' ? a.date : '';
            const db = typeof b.date === 'string' ? b.date : '';
            return da.localeCompare(db);
        });
    }, [series, effectiveMode, historyFor]);

    const primaryHasHistory = historyFor(series[0]).length > 0;

    // A selected period whose data hasn't landed yet: the page-range history is
    // still in hand, but drawing it under a highlighted "5Y" would misreport the
    // chart on a live projector. Show the placeholder until the right data is in.
    const periodPending = range !== pageRange && !override.data && !override.failed;

    const available = useMemo(() => {
        const pickedSymbols = new Set([item.symbol, ...compareSymbols]);
        const q = search.trim().toLowerCase();
        return allData
            .filter(d => !pickedSymbols.has(d.symbol))
            .filter(d =>
                !q ||
                d.symbol.toLowerCase().includes(q) ||
                d.name.toLowerCase().includes(q) ||
                (d.nameEn || '').toLowerCase().includes(q)
            )
            .slice(0, 50);
    }, [allData, item.symbol, compareSymbols, search]);

    const addCompare = (symbol: string) => {
        setCompareSymbols(prev =>
            prev.length >= MAX_COMPARE || prev.includes(symbol) ? prev : [...prev, symbol]);
        setSearch('');
        setPickerOpen(false);
    };

    const removeCompare = (symbol: string) => {
        setCompareSymbols(prev => prev.filter(s => s !== symbol));
    };

    const isPositive = item.change >= 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Chart for ${item.name}`}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[760px] max-w-[95vw] max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-zinc-900">
                    <div>
                        <div className="text-[10px] font-mono tracking-widest text-zinc-500">{item.symbol}</div>
                        <div className="text-lg font-bold text-zinc-100 mt-0.5">
                            {displayName(item, lang)}
                        </div>
                        <div className="flex items-baseline gap-3 mt-1">
                            <span className="text-2xl font-mono font-bold text-white">
                                {formatPrice(item.price)}
                            </span>
                            <span className={`text-sm font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatSigned(item.changePercent)}%
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Period */}
                <div className="flex items-center gap-3 px-5 pt-4">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
                        {L.period}:
                    </span>
                    <TimeRangeSelector
                        value={range}
                        onChange={(r) => setRange(r as TimeRange)}
                        variant="subtle"
                    />
                </div>

                {/* Chart */}
                <div className="p-5 flex-1 min-h-0 flex flex-col">
                    {periodPending ? (
                        <div className="h-[340px] flex items-center justify-center text-sm text-zinc-500">
                            {L.loading}
                        </div>
                    ) : override.failed ? (
                        <div className="h-[340px] flex items-center justify-center text-sm text-amber-500 px-6 text-center">
                            {L.rangeFailed(range)}
                        </div>
                    ) : !primaryHasHistory ? (
                        <div className="h-[340px] flex items-center justify-center text-sm text-zinc-500">
                            {L.noHistory}
                        </div>
                    ) : (
                        <div className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#52525b"
                                        fontSize={10}
                                        tickFormatter={(v) => formatDate(v, { month: 'short', day: 'numeric' })}
                                        minTickGap={40}
                                    />
                                    <YAxis
                                        stroke="#52525b"
                                        fontSize={10}
                                        tickFormatter={(v: number) =>
                                            effectiveMode === 'percent'
                                                ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
                                                : formatWhole(v)
                                        }
                                        domain={['auto', 'auto']}
                                        width={60}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(24,24,27,0.95)',
                                            border: '1px solid #3f3f46',
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                        labelStyle={{ color: '#a1a1aa' }}
                                        formatter={(val: number, name: string) => [
                                            effectiveMode === 'percent'
                                                ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
                                                : formatPrice(val),
                                            name,
                                        ]}
                                        labelFormatter={(v) => formatDate(v, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    {series.map(s => (
                                        <Line
                                            key={s.item.symbol}
                                            type="monotone"
                                            dataKey={s.item.symbol}
                                            name={displayName(s.item, lang)}
                                            stroke={s.color}
                                            strokeWidth={s.item.symbol === item.symbol ? 2.5 : 1.8}
                                            dot={false}
                                            activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2, fill: s.color }}
                                            connectNulls
                                            isAnimationActive={false}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
                            {L.compare}:
                        </span>

                        {compareSymbols.map((symbol, i) => (
                            <span
                                key={symbol}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-zinc-900 border border-zinc-800"
                                style={{ borderColor: compareColor(i) + '55' }}
                            >
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: compareColor(i) }}
                                />
                                <span className="text-zinc-300">{symbol}</span>
                                <button
                                    onClick={() => removeCompare(symbol)}
                                    className="text-zinc-500 hover:text-zinc-200"
                                    aria-label={`Remove ${symbol}`}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}

                        {compareSymbols.length < MAX_COMPARE ? (
                            <button
                                onClick={() => setPickerOpen(o => !o)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            >
                                <Plus className="w-3 h-3" />
                                {L.addIndex}
                            </button>
                        ) : (
                            <span className="text-[10px] text-zinc-600">{L.limit}</span>
                        )}

                        <div className="ml-auto flex items-center gap-1">
                            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase mr-1">
                                {L.mode}:
                            </span>
                            <button
                                onClick={() => setChartMode('nominal')}
                                disabled={hasCompare}
                                className={`px-2 py-1 rounded text-[10px] font-mono transition ${
                                    effectiveMode === 'nominal'
                                        ? 'bg-zinc-800 text-zinc-100'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                } ${hasCompare ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={hasCompare ? 'Percent mode used while comparing' : ''}
                            >
                                {L.nominal}
                            </button>
                            <button
                                onClick={() => setChartMode('percent')}
                                className={`px-2 py-1 rounded text-[10px] font-mono transition ${
                                    effectiveMode === 'percent'
                                        ? 'bg-zinc-800 text-zinc-100'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                {L.percent}
                            </button>
                        </div>
                    </div>

                    {/* Picker */}
                    {pickerOpen && (
                        <div className="mt-3 border border-zinc-800 rounded-xl bg-zinc-900/60 p-3">
                            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                                <Search className="w-3.5 h-3.5 text-zinc-500" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={L.search}
                                    className="flex-1 bg-transparent outline-none text-sm text-zinc-200 placeholder:text-zinc-600"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                                {available.map(d => {
                                    const up = d.changePercent >= 0;
                                    return (
                                        <button
                                            key={d.symbol}
                                            onClick={() => addCompare(d.symbol)}
                                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition text-left"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-zinc-200 truncate">
                                                    {displayName(d, lang)}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 font-mono">{d.symbol}</div>
                                            </div>
                                            <div className={`text-[10px] font-mono font-bold shrink-0 ml-2 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {formatSigned(d.changePercent)}%
                                            </div>
                                        </button>
                                    );
                                })}
                                {available.length === 0 && (
                                    <div className="col-span-2 text-center text-xs text-zinc-600 py-4">—</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
