import { useEffect, useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { QuoteItem } from '../types/QuoteItem';

interface Props {
    items: QuoteItem[];
    pinnedIds: Set<string>;
    onToggle: (item: QuoteItem) => void;
    onClearAll: () => void;
    onClose: () => void;
}

export function QuotePickerModal({ items, pinnedIds, onToggle, onClearAll, onClose }: Props) {
    const [search, setSearch] = useState('');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(d =>
            d.id.toLowerCase().includes(q) ||
            d.name.toLowerCase().includes(q)
        );
    }, [items, search]);

    const marketItems = filtered.filter(i => i.group === 'market');
    const macroItems = filtered.filter(i => i.group === 'macro');
    const pinnedCount = pinnedIds.size;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Quick quotes picker"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[460px] p-4 max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono tracking-widest text-zinc-400">QUICK QUOTES</span>
                        {pinnedCount > 0 && (
                            <span className="text-[10px] text-zinc-600">{pinnedCount} pinned</span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search symbols or names…"
                        className="flex-1 bg-transparent outline-none text-sm text-zinc-200 placeholder:text-zinc-600"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-zinc-600 hover:text-zinc-400">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {/* Market section */}
                    {marketItems.length > 0 && (
                        <>
                            {macroItems.length > 0 && (
                                <div className="col-span-2 pb-1">
                                    <span className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">Indices</span>
                                </div>
                            )}
                            {marketItems.map(d => (
                                <ItemButton key={d.id} item={d} isPinned={pinnedIds.has(d.id)} onClick={() => onToggle(d)} />
                            ))}
                        </>
                    )}

                    {/* Macro section */}
                    {macroItems.length > 0 && (
                        <>
                            <div className="col-span-2 pt-2 pb-1 border-t border-zinc-800 mt-1">
                                <span className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">Macro</span>
                            </div>
                            {macroItems.map(d => (
                                <ItemButton key={d.id} item={d} isPinned={pinnedIds.has(d.id)} onClick={() => onToggle(d)} />
                            ))}
                        </>
                    )}

                    {filtered.length === 0 && (
                        <div className="col-span-2 text-center text-xs text-zinc-600 py-6">
                            No matches found
                        </div>
                    )}

                    {/* Clear all */}
                    {pinnedCount > 0 && (
                        <button
                            onClick={onClearAll}
                            className="col-span-2 mt-3 w-full text-xs text-zinc-600 hover:text-zinc-400 text-center"
                        >
                            Clear all pinned ({pinnedCount})
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Inline toggle button — replaces the old QuoteButton component */
function ItemButton({ item, isPinned, onClick }: { item: QuoteItem; isPinned: boolean; onClick: () => void }) {
    const up = item.changePct >= 0;
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-between px-3 py-2 rounded-lg border transition text-left ${
                isPinned
                    ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20'
                    : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
            }`}
        >
            <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200 truncate max-w-[120px]">{item.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{item.id}</div>
            </div>
            <div className={`text-xs font-mono font-bold shrink-0 ml-2 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                {up ? '+' : ''}{item.changePct?.toFixed(2)}%{item.changeLabel ? ` ${item.changeLabel}` : ''}
            </div>
        </button>
    );
}
