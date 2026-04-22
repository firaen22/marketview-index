import type { IndexData, MacroData } from '../types';
import { PinnedQuoteCard } from './PinnedQuoteCard';

interface Props {
    quotes: IndexData[];
    onRemove: (symbol: string) => void;
    onItemClick?: (item: IndexData) => void;
    macroQuotes?: MacroData[];
    onRemoveMacro?: (symbol: string) => void;
}

export function QuotePanel({ quotes, onRemove, onItemClick, macroQuotes, onRemoveMacro }: Props) {
    const macroList = macroQuotes ?? [];
    if (quotes.length === 0 && macroList.length === 0) return null;

    return (
        <div className="w-44 flex flex-col border-l border-zinc-900 bg-zinc-950 overflow-y-auto shrink-0">
            {quotes.map((q, i) => (
                <PinnedQuoteCard
                    key={q.symbol}
                    symbol={q.symbol}
                    name={q.name}
                    primaryValue={q.price}
                    primaryChangePct={q.changePercent}
                    history={q.history}
                    showDivider={i > 0}
                    onRemove={() => onRemove(q.symbol)}
                    onClick={onItemClick ? () => onItemClick(q) : undefined}
                />
            ))}
            {onRemoveMacro && macroList.map((q, i) => (
                <PinnedQuoteCard
                    key={q.symbol}
                    symbol={q.symbol}
                    name={q.name}
                    primaryValue={q.value}
                    primaryChangePct={q.changePercent}
                    primaryChangeLabel="YoY"
                    secondaryChangePct={q.momChangePercent}
                    secondaryLabel="MoM"
                    showDivider={i > 0 || quotes.length > 0}
                    onRemove={() => onRemoveMacro(q.symbol)}
                />
            ))}
        </div>
    );
}
