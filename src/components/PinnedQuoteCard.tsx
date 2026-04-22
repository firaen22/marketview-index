import { X } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { HistoryPoint } from '../types';

interface Props {
    symbol: string;
    name: string;
    primaryValue: number;
    primaryChangePct: number;
    primaryChangeLabel?: string;
    secondaryChangePct?: number;
    secondaryLabel?: string;
    history?: HistoryPoint[];
    showDivider: boolean;
    onRemove: () => void;
    onClick?: () => void;
}

export function PinnedQuoteCard({
    symbol, name, primaryValue, primaryChangePct, primaryChangeLabel,
    secondaryChangePct, secondaryLabel, history, showDivider, onRemove, onClick,
}: Props) {
    const isPositive = primaryChangePct >= 0;
    const color = isPositive ? '#34d399' : '#fb7185';
    const hasHistory = history && history.length > 1;
    const isSecondaryPositive = (secondaryChangePct ?? 0) >= 0;

    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            } : undefined}
            className={`flex flex-col gap-1 px-3 py-3 ${showDivider ? 'border-t border-zinc-900' : ''} ${onClick ? 'cursor-pointer hover:bg-zinc-900 transition' : ''}`}
        >
            <div className="flex items-start justify-between gap-1">
                <div className="text-[10px] text-zinc-500 font-mono leading-none">{symbol}</div>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-700 hover:text-zinc-400 shrink-0"
                    aria-label={`Remove ${symbol}`}
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            </div>
            <div className="text-[11px] text-zinc-400 leading-tight">{name}</div>
            <div className="text-xl font-bold font-mono text-white leading-none mt-1">
                {primaryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-xs font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '▲' : '▼'} {Math.abs(primaryChangePct).toFixed(2)}%{primaryChangeLabel ? ` ${primaryChangeLabel}` : ''}
            </div>
            {secondaryChangePct !== undefined && (
                <div className={`text-[10px] font-mono ${isSecondaryPositive ? 'text-emerald-500/70' : 'text-red-400/70'}`}>
                    {isSecondaryPositive ? '+' : ''}{secondaryChangePct.toFixed(2)}%{secondaryLabel ? ` ${secondaryLabel}` : ''}
                </div>
            )}
            {hasHistory && (
                <div className="h-10 w-full mt-1.5">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
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
}
