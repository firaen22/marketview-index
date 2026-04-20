import { X } from 'lucide-react';
import type { IndexData } from '../types';

interface Props {
    marketData: IndexData[];
    pinnedQuotes: IndexData[];
    onToggle: (item: IndexData) => void;
    onClearAll: () => void;
    onClose: () => void;
}

export function QuotePickerModal({ marketData, pinnedQuotes, onToggle, onClearAll, onClose }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[460px] p-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono tracking-widest text-zinc-400">QUICK QUOTES</span>
                        <span className="text-[10px] text-zinc-600">{pinnedQuotes.length} pinned</span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {marketData.map(d => {
                        const up = d.changePercent >= 0;
                        const isPinned = pinnedQuotes.some(p => p.symbol === d.symbol);
                        return (
                            <button
                                key={d.symbol}
                                onClick={() => onToggle(d)}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition text-left ${
                                    isPinned
                                        ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20'
                                        : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-zinc-200 truncate max-w-[120px]">{d.name}</div>
                                    <div className="text-[10px] text-zinc-500 font-mono">{d.symbol}</div>
                                </div>
                                <div className={`text-xs font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {up ? '+' : ''}{d.changePercent?.toFixed(2)}%
                                </div>
                            </button>
                        );
                    })}
                </div>
                {pinnedQuotes.length > 0 && (
                    <button
                        onClick={onClearAll}
                        className="mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 text-center"
                    >
                        Clear all pinned ({pinnedQuotes.length})
                    </button>
                )}
            </div>
        </div>
    );
}
