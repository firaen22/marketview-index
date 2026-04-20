import React from 'react';
import { X } from 'lucide-react';
import type { IndexData } from '../types';

interface Props {
    quotes: IndexData[];
    onRemove: (symbol: string) => void;
}

export const QuotePanel: React.FC<Props> = ({ quotes, onRemove }) => {
    if (quotes.length === 0) return null;
    return (
        <div className="w-44 flex flex-col border-l border-zinc-900 bg-zinc-950 overflow-y-auto shrink-0">
            {quotes.map((q, i) => (
                <div key={q.symbol} className={`flex flex-col gap-1 px-3 py-4 ${i > 0 ? 'border-t border-zinc-900' : ''}`}>
                    <div className="flex items-start justify-between gap-1">
                        <div className="text-[10px] text-zinc-500 font-mono leading-none">{q.symbol}</div>
                        <button
                            onClick={() => onRemove(q.symbol)}
                            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-700 hover:text-zinc-400 shrink-0"
                        >
                            <X className="w-2.5 h-2.5" />
                        </button>
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-tight">{q.name}</div>
                    <div className="text-xl font-bold font-mono text-white leading-none mt-1">
                        {typeof q.price === 'number' ? q.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : q.price}
                    </div>
                    <div className={`text-xs font-mono font-bold ${q.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {q.changePercent >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                    </div>
                </div>
            ))}
        </div>
    );
};
