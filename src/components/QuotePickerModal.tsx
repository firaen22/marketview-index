import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { IndexData, MacroData } from '../types';
import { QuoteButton } from './QuoteButton';

interface Props {
    marketData: IndexData[];
    pinnedQuotes: IndexData[];
    onToggle: (item: IndexData) => void;
    onClearAll: () => void;
    onClose: () => void;
    macroData?: MacroData[];
    pinnedMacroQuotes?: MacroData[];
    onToggleMacro?: (item: MacroData) => void;
}

export function QuotePickerModal({ marketData, pinnedQuotes, onToggle, onClearAll, onClose, macroData, pinnedMacroQuotes, onToggleMacro }: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const macroPinnedCount = pinnedMacroQuotes?.length ?? 0;
    const totalPinned = pinnedQuotes.length + macroPinnedCount;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Quick quotes picker"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[460px] p-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono tracking-widest text-zinc-400">QUICK QUOTES</span>
                        <span className="text-[10px] text-zinc-600">{totalPinned} pinned</span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {marketData.map(d => (
                        <QuoteButton
                            key={d.symbol}
                            name={d.name}
                            symbol={d.symbol}
                            changePercent={d.changePercent}
                            isPinned={pinnedQuotes.some(p => p.symbol === d.symbol)}
                            onClick={() => onToggle(d)}
                        />
                    ))}
                    {macroData && macroData.length > 0 && onToggleMacro && (
                        <>
                            <div className="col-span-2 pt-2 pb-1 border-t border-zinc-800 mt-1">
                                <span className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">Macro</span>
                            </div>
                            {macroData.map(d => (
                                <QuoteButton
                                    key={d.symbol}
                                    name={d.name}
                                    symbol={d.symbol}
                                    changePercent={d.changePercent}
                                    suffix="YoY"
                                    isPinned={pinnedMacroQuotes?.some(p => p.symbol === d.symbol) ?? false}
                                    onClick={() => onToggleMacro(d)}
                                />
                            ))}
                        </>
                    )}
                    {totalPinned > 0 && (
                        <button
                            onClick={onClearAll}
                            className="col-span-2 mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 text-center"
                        >
                            Clear all pinned ({totalPinned})
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
