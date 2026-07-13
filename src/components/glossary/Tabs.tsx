import { Bookmark, Clock3, List } from 'lucide-react';

export type GlossaryTab = 'latest' | 'all' | 'saved';

interface Props {
    active: GlossaryTab;
    labels: Record<GlossaryTab, string>;
    counts: Record<GlossaryTab, number>;
    onChange: (tab: GlossaryTab) => void;
}

const ICONS = {
    latest: Clock3,
    all: List,
    saved: Bookmark,
};

export function Tabs({ active, labels, counts, onChange }: Props) {
    return (
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-black p-1">
            {(Object.keys(labels) as GlossaryTab[]).map(tab => {
                const Icon = ICONS[tab];
                const selected = active === tab;
                return (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => onChange(tab)}
                        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold ${
                            selected
                                ? 'bg-emerald-500 text-black'
                                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        <span>{labels[tab]}</span>
                        <span className={`font-mono text-[11px] ${selected ? 'text-black/70' : 'text-zinc-600'}`}>
                            {counts[tab]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
