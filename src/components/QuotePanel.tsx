import { X } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { IndexData, MacroData } from '../types';

interface Props {
    quotes: IndexData[];
    onRemove: (symbol: string) => void;
    onItemClick?: (item: IndexData) => void;
    macroQuotes?: MacroData[];
    onRemoveMacro?: (symbol: string) => void;
}

export function QuotePanel({ quotes, onRemove, onItemClick, macroQuotes, onRemoveMacro }: Props) {
    if (quotes.length === 0 && (!macroQuotes || macroQuotes.length === 0)) return null;
    return (
        <div className="w-44 flex flex-col border-l border-zinc-900 bg-zinc-950 overflow-y-auto shrink-0">
            {quotes.map((q, i) => {
                const isPositive = q.changePercent >= 0;
                const color = isPositive ? '#34d399' : '#fb7185';
                const hasHistory = q.history.length > 1;

                return (
                    <div
                        key={q.symbol}
                        role={onItemClick ? 'button' : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                        onClick={onItemClick ? () => onItemClick(q) : undefined}
                        onKeyDown={onItemClick ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onItemClick(q);
                            }
                        } : undefined}
                        className={`flex flex-col gap-1 px-3 py-3 ${i > 0 ? 'border-t border-zinc-900' : ''} ${onItemClick ? 'cursor-pointer hover:bg-zinc-900 transition' : ''}`}
                    >
                        <div className="flex items-start justify-between gap-1">
                            <div className="text-[10px] text-zinc-500 font-mono leading-none">{q.symbol}</div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(q.symbol); }}
                                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-700 hover:text-zinc-400 shrink-0"
                                aria-label={`Remove ${q.symbol}`}
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                        <div className="text-[11px] text-zinc-400 leading-tight">{q.name}</div>
                        <div className="text-xl font-bold font-mono text-white leading-none mt-1">
                            {q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-xs font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                        </div>

                        {hasHistory && (
                            <div className="h-10 w-full mt-1.5">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={q.history}>
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={color}
                                            strokeWidth={1.5}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                        <YAxis
                                            domain={[
                                                (min: number) => min - Math.abs(min) * 0.05,
                                                (max: number) => max + Math.abs(max) * 0.05,
                                            ]}
                                            hide
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                );
            })}
            {macroQuotes && macroQuotes.length > 0 && onRemoveMacro && macroQuotes.map((q, i) => {
                const isPositive = q.changePercent >= 0;
                const isMomPositive = (q.momChangePercent || 0) >= 0;
                const isFirst = i === 0 && quotes.length === 0;
                return (
                    <div
                        key={q.symbol}
                        className={`flex flex-col gap-1 px-3 py-3 ${!isFirst ? 'border-t border-zinc-900' : ''}`}
                    >
                        <div className="flex items-start justify-between gap-1">
                            <div className="text-[10px] text-zinc-500 font-mono leading-none">{q.symbol}</div>
                            <button
                                onClick={() => onRemoveMacro(q.symbol)}
                                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-700 hover:text-zinc-400 shrink-0"
                                aria-label={`Remove ${q.symbol}`}
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                        <div className="text-[11px] text-zinc-400 leading-tight">{q.name}</div>
                        <div className="text-xl font-bold font-mono text-white leading-none mt-1">
                            {q.value.toFixed(2)}
                        </div>
                        <div className={`text-xs font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}% YoY
                        </div>
                        {q.momChangePercent !== undefined && (
                            <div className={`text-[10px] font-mono ${isMomPositive ? 'text-emerald-500/70' : 'text-red-400/70'}`}>
                                {isMomPositive ? '+' : ''}{q.momChangePercent.toFixed(2)}% MoM
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
