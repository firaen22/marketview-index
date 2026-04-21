import { useState } from 'react';
import { ListChecks, Check } from 'lucide-react';
import { Modal } from './Modal';
import { cn, setSetting, groupByCategory } from '../utils';
import type { IndexData } from '../types';
import type { TDict } from '../locales';

interface Props {
    allSymbols: IndexData[];
    selected: string[] | null;
    language: 'en' | 'zh-TW';
    t: TDict;
    onClose: () => void;
    onSave: (next: string[] | null) => void;
}

export function TickerConfigModal({ allSymbols, selected, language, t, onClose, onSave }: Props) {
    const [draft, setDraft] = useState<Set<string>>(
        () => new Set(selected ?? allSymbols.map(s => s.symbol))
    );
    const [showAll, setShowAll] = useState<boolean>(selected === null);

    const toggle = (symbol: string) => {
        setShowAll(false);
        setDraft(prev => {
            const next = new Set(prev);
            if (next.has(symbol)) next.delete(symbol);
            else next.add(symbol);
            return next;
        });
    };

    const save = () => {
        if (showAll) {
            setSetting('tickerSymbols', null);
            onSave(null);
        } else {
            const next = Array.from(draft);
            setSetting('tickerSymbols', next);
            onSave(next);
        }
        onClose();
    };

    const selectAll = () => {
        setShowAll(true);
        setDraft(new Set(allSymbols.map(s => s.symbol)));
    };

    const clearAll = () => {
        setShowAll(false);
        setDraft(new Set());
    };

    const grouped = groupByCategory(allSymbols);

    return (
        <Modal
            title={<><ListChecks className="w-5 h-5 mr-2 text-emerald-400" />{t.tickerConfig?.title || 'Header Ticker'}</>}
            onClose={onClose}
            maxWidth="max-w-lg"
            zIndex={110}
            accent="from-emerald-500 via-cyan-500 to-blue-500"
            cardClassName="max-h-[80vh]"
            bodyClassName="p-0 flex-1 min-h-0 flex flex-col"
            footer={
                <>
                    <button
                        onClick={save}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-all active:scale-[0.98]"
                    >
                        {t.saveConfig || 'Save'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-lg transition-all"
                    >
                        {t.tickerConfig?.cancel || 'Cancel'}
                    </button>
                </>
            }
        >
            <div className="px-5 pb-2 flex items-center justify-between text-xs text-zinc-400">
                <span>
                    {showAll
                        ? (t.tickerConfig?.showingAll || 'Showing all symbols')
                        : `${draft.size} / ${allSymbols.length} ${t.tickerConfig?.selected || 'selected'}`}
                </span>
                <div className="flex gap-2">
                    <button onClick={selectAll} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] font-semibold">
                        {t.tickerConfig?.selectAll || 'Select all'}
                    </button>
                    <button onClick={clearAll} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] font-semibold">
                        {t.tickerConfig?.clear || 'Clear'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                {Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                            {t.categories?.[category] || category}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {items.map(d => {
                                const isOn = showAll || draft.has(d.symbol);
                                return (
                                    <button
                                        key={d.symbol}
                                        onClick={() => toggle(d.symbol)}
                                        className={cn(
                                            "flex items-center justify-between px-3 py-2 rounded-lg border text-left transition",
                                            isOn
                                                ? "bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20"
                                                : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-zinc-200 truncate">
                                                {language === 'en' ? (d.nameEn || d.name) : d.name}
                                            </div>
                                            <div className="text-[10px] text-zinc-500 font-mono">{d.symbol}</div>
                                        </div>
                                        {isOn && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-2" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
