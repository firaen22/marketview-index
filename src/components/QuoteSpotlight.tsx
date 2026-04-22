import type { QuoteItem } from '../types/QuoteItem';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    item: QuoteItem;
    onDismiss: () => void;
    index?: number;
    total?: number;
    onPrev?: () => void;
    onNext?: () => void;
}

function formatValue(v: number): string {
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(p: number | undefined): string {
    if (p === undefined || p === null) return '—';
    const sign = p > 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
}

function pctColor(p: number | undefined): string {
    if (p === undefined || p === null) return 'text-zinc-400';
    if (p > 0) return 'text-emerald-400';
    if (p < 0) return 'text-rose-400';
    return 'text-zinc-300';
}

export function QuoteSpotlight({ item, onDismiss, index, total, onPrev, onNext }: Props) {
    const hasNav = total !== undefined && total > 1 && index !== undefined;
    const isMarket = item.group === 'market';
    const secondaryLabel = isMarket ? 'YTD' : item.secondaryLabel;
    const secondaryPct = isMarket ? item.ytdPct : item.secondaryPct;
    const primaryLabel = item.changeLabel ?? 'CHG';

    return (
        <div
            className="absolute bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800 shadow-2xl animate-in slide-in-from-bottom-8 duration-300"
            role="dialog"
            aria-label={`Quote spotlight: ${item.name}`}
        >
            <div className="flex items-center gap-8 px-10 py-5 min-h-[100px]">
                {hasNav && (
                    <button
                        onClick={onPrev}
                        className="p-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                        title="Previous (←)"
                        aria-label="Previous quote"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}
                <div className="flex-1 flex items-baseline gap-6 min-w-0">
                    <div className="min-w-0">
                        <div className="text-2xl font-semibold text-zinc-50 truncate">{item.name}</div>
                        <div className="text-xs font-mono text-zinc-500 tracking-widest uppercase">{item.id}</div>
                    </div>
                </div>

                <div className="flex items-baseline gap-2">
                    <div className="text-5xl font-mono font-bold text-zinc-50 tabular-nums">
                        {formatValue(item.value)}
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{primaryLabel}</div>
                    <div className={`text-3xl font-mono font-bold tabular-nums ${pctColor(item.changePct)}`}>
                        {formatPct(item.changePct)}
                    </div>
                </div>

                {secondaryPct !== undefined && (
                    <div className="flex flex-col items-end">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{secondaryLabel}</div>
                        <div className={`text-2xl font-mono font-semibold tabular-nums ${pctColor(secondaryPct)}`}>
                            {formatPct(secondaryPct)}
                        </div>
                    </div>
                )}

                {hasNav && (
                    <>
                        <button
                            onClick={onNext}
                            className="p-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                            title="Next (→)"
                            aria-label="Next quote"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                        <div className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            {(index! + 1)}/{total}
                        </div>
                    </>
                )}

                <button
                    onClick={onDismiss}
                    className="ml-2 p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                    title="Dismiss (Esc or Q)"
                    aria-label="Dismiss spotlight"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
