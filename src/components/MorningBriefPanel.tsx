import { useMemo, useState } from 'react';
import { X, Plus, ArrowUp, ArrowDown, Trash2, Sunrise } from 'lucide-react';
import type { QuoteItem } from '../types/QuoteItem';

interface Props {
    items: QuoteItem[];              // all available (for picker)
    brief: string[];                 // current ordered symbols
    onChange: (next: string[]) => void;
    onClose: () => void;
}

const MAX_RESULTS = 6;

export function MorningBriefPanel({ items, brief, onChange, onClose }: Props) {
    const [query, setQuery] = useState('');

    const itemsById = useMemo(() => {
        const map = new Map<string, QuoteItem>();
        for (const i of items) map.set(i.id, i);
        return map;
    }, [items]);

    const briefItems = useMemo(
        () => brief.map(id => itemsById.get(id)).filter((x): x is QuoteItem => !!x),
        [brief, itemsById]
    );

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return items
            .filter(i => !brief.includes(i.id))
            .filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
            .slice(0, MAX_RESULTS);
    }, [query, items, brief]);

    const add = (id: string) => {
        onChange([...brief, id]);
        setQuery('');
    };
    const remove = (id: string) => onChange(brief.filter(s => s !== id));
    const move = (id: string, delta: -1 | 1) => {
        const i = brief.indexOf(id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= brief.length) return;
        const next = [...brief];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-label="Morning Brief configuration"
        >
            <div
                className="w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <Sunrise className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-semibold text-zinc-100">Morning Brief</span>
                        <span className="text-[10px] font-mono text-zinc-500">{brief.length} pre-selected</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Current list */}
                    <div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                            Order (← / → cycles during spotlight)
                        </div>
                        {briefItems.length === 0 ? (
                            <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg">
                                No items yet — add from the search below
                            </div>
                        ) : (
                            <ul className="space-y-1">
                                {briefItems.map((item, idx) => (
                                    <li
                                        key={item.id}
                                        className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg"
                                    >
                                        <span className="font-mono text-xs text-zinc-500 w-6 tabular-nums">{idx + 1}.</span>
                                        <span className="font-mono text-xs text-zinc-400 w-20 truncate">{item.id}</span>
                                        <span className="flex-1 text-sm text-zinc-200 truncate">{item.name}</span>
                                        <button
                                            onClick={() => move(item.id, -1)}
                                            disabled={idx === 0}
                                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
                                            aria-label="Move up"
                                        >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => move(item.id, 1)}
                                            disabled={idx === briefItems.length - 1}
                                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
                                            aria-label="Move down"
                                        >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => remove(item.id)}
                                            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition"
                                            aria-label="Remove"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Add via search */}
                    <div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                            Add item
                        </div>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search symbol or name…"
                            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                        />
                        {results.length > 0 && (
                            <ul className="mt-2 border border-zinc-800 rounded-lg overflow-hidden">
                                {results.map(r => (
                                    <li
                                        key={r.id}
                                        onClick={() => add(r.id)}
                                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800/70 transition"
                                    >
                                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="font-mono text-xs text-zinc-500 w-20 truncate">{r.id}</span>
                                        <span className="flex-1 text-sm text-zinc-200 truncate">{r.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
