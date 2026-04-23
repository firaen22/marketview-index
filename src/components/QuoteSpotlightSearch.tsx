import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { QuoteItem } from '../types/QuoteItem';

interface Props {
    items: QuoteItem[];
    pinnedIds?: Set<string>;
    onCommit: (item: QuoteItem) => void;
    onClose: () => void;
}

const MAX_RESULTS = 6;

function pctColor(p: number): string {
    if (p > 0) return 'text-emerald-400';
    if (p < 0) return 'text-rose-400';
    return 'text-zinc-400';
}

export function QuoteSpotlightSearch({ items, pinnedIds, onCommit, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items
            .filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
            .slice(0, MAX_RESULTS);
    }, [query, items]);

    useEffect(() => { setSelectedIdx(0); }, [query]);

    const commit = (item: QuoteItem) => {
        onCommit(item);
        setQuery('');
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = results[selectedIdx];
            if (pick) commit(pick);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(results.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(0, i - 1));
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-label="Quick quote search"
        >
            <div
                className="w-full max-w-xl mx-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search symbol or name…"
                    className="w-full px-5 py-4 bg-transparent text-lg text-zinc-100 placeholder:text-zinc-600 outline-none border-b border-zinc-800 font-mono"
                />
                <ul className="max-h-80 overflow-y-auto">
                    {results.length === 0 ? (
                        <li className="px-5 py-4 text-sm text-zinc-500">No matches</li>
                    ) : (
                        results.map((r, i) => {
                            const isPinned = pinnedIds?.has(r.id);
                            return (
                                <li
                                    key={r.id}
                                    onMouseEnter={() => setSelectedIdx(i)}
                                    onClick={() => commit(r)}
                                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                                        i === selectedIdx ? 'bg-zinc-800/70' : 'hover:bg-zinc-900'
                                    }`}
                                >
                                    <span className="w-4 shrink-0 flex items-center justify-center">
                                        {isPinned && <Check className="w-3 h-3 text-emerald-400" />}
                                    </span>
                                    <span className="font-mono text-xs text-zinc-500 w-20 truncate">{r.id}</span>
                                    <span className="flex-1 text-sm text-zinc-200 truncate">{r.name}</span>
                                    <span className="font-mono text-xs text-zinc-400 tabular-nums">
                                        {r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={`font-mono text-xs tabular-nums w-16 text-right ${pctColor(r.changePct)}`}>
                                        {r.changePct > 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                                    </span>
                                </li>
                            );
                        })
                    )}
                </ul>
                <div className="flex items-center justify-between px-5 py-2 border-t border-zinc-900">
                    <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-600">
                        <span><kbd className="text-emerald-500">↑↓</kbd> select</span>
                        <span><kbd className="text-emerald-500">↵</kbd> toggle pin</span>
                        <span><kbd className="text-emerald-500">Esc</kbd> done</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 text-xs font-mono font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
