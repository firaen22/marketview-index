import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { IndexData } from '../types';
import { displayName } from '../utils';

interface Props {
    item: IndexData;
    allData: IndexData[];
    onClose: () => void;
    lang?: 'en' | 'zh-TW';
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
    },
};

type Series = { item: IndexData; color: string };

export function IndexChartModal({ item, allData, onClose, lang = 'en' }: Props) {
    const L = LABELS[lang];
    const [compareItems, setCompareItems] = useState<IndexData[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [chartMode, setChartMode] = useState<'percent' | 'nominal'>('nominal');

    const hasCompare = compareItems.length > 0;
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
        return [
            { item, color: PALETTE[0] },
            ...compareItems.map((c, i) => ({ item: c, color: PALETTE[(i + 1) % PALETTE.length] })),
        ];
    }, [item, compareItems]);

    const chartData = useMemo(() => {
        const dateMap = new Map<string, Record<string, number | string>>();
        for (const s of series) {
            const hist = s.item.history || [];
            if (hist.length === 0) continue;
            const base = hist[0].value;
            hist.forEach((pt, idx) => {
                const key = pt.date || String(idx);
                if (!dateMap.has(key)) dateMap.set(key, { date: key });
                const row = dateMap.get(key)!;
                const val =
                    effectiveMode === 'percent' && base !== 0
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
    }, [series, effectiveMode]);

    const primaryHasHistory = (item.history?.length ?? 0) > 0;

    const available = useMemo(() => {
        const pickedSymbols = new Set([item.symbol, ...compareItems.map(c => c.symbol)]);
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
    }, [allData, item.symbol, compareItems, search]);

    const addCompare = (d: IndexData) => {
        if (compareItems.length >= MAX_COMPARE) return;
        setCompareItems(prev => [...prev, d]);
        setSearch('');
        setPickerOpen(false);
    };

    const removeCompare = (symbol: string) => {
        setCompareItems(prev => prev.filter(c => c.symbol !== symbol));
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
                                {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-sm font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
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

                {/* Chart */}
                <div className="p-5 flex-1 min-h-0 flex flex-col">
                    {!primaryHasHistory ? (
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
                                                : v.toLocaleString(undefined, { maximumFractionDigits: 0 })
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
                                                : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

                        {compareItems.map((c, i) => (
                            <span
                                key={c.symbol}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-zinc-900 border border-zinc-800"
                                style={{ borderColor: PALETTE[(i + 1) % PALETTE.length] + '55' }}
                            >
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: PALETTE[(i + 1) % PALETTE.length] }}
                                />
                                <span className="text-zinc-300">{c.symbol}</span>
                                <button
                                    onClick={() => removeCompare(c.symbol)}
                                    className="text-zinc-500 hover:text-zinc-200"
                                    aria-label={`Remove ${c.symbol}`}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}

                        {compareItems.length < MAX_COMPARE ? (
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
                                            onClick={() => addCompare(d)}
                                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition text-left"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-zinc-200 truncate">
                                                    {displayName(d, lang)}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 font-mono">{d.symbol}</div>
                                            </div>
                                            <div className={`text-[10px] font-mono font-bold shrink-0 ml-2 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {up ? '+' : ''}{d.changePercent?.toFixed(2)}%
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
