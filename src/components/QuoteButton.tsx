interface Props {
    name: string;
    symbol: string;
    changePercent: number;
    suffix?: string;
    isPinned: boolean;
    onClick: () => void;
}

export function QuoteButton({ name, symbol, changePercent, suffix, isPinned, onClick }: Props) {
    const up = changePercent >= 0;
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-between px-3 py-2 rounded-lg border transition text-left ${
                isPinned
                    ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/20'
                    : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
            }`}
        >
            <div>
                <div className="text-xs font-semibold text-zinc-200 truncate max-w-[120px]">{name}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{symbol}</div>
            </div>
            <div className={`text-xs font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                {up ? '+' : ''}{changePercent?.toFixed(2)}%{suffix ? ` ${suffix}` : ''}
            </div>
        </button>
    );
}
