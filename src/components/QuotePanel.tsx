import type { QuoteItem } from '../types/QuoteItem';
import { PinnedQuoteCard } from './PinnedQuoteCard';

interface Props {
    items: QuoteItem[];
    onRemove: (id: string) => void;
    onItemClick?: (item: QuoteItem) => void;
}

export function QuotePanel({ items, onRemove, onItemClick }: Props) {
    if (items.length === 0) return null;

    const marketItems = items.filter(i => i.group === 'market');
    const macroItems = items.filter(i => i.group === 'macro');

    return (
        <div className="w-44 flex flex-col border-l border-zinc-900 bg-zinc-950 overflow-y-auto shrink-0">
            {marketItems.map((item, i) => (
                <PinnedQuoteCard
                    key={item.id}
                    item={item}
                    showDivider={i > 0}
                    onRemove={() => onRemove(item.id)}
                    onClick={onItemClick ? () => onItemClick(item) : undefined}
                />
            ))}
            {macroItems.length > 0 && marketItems.length > 0 && (
                <div className="border-t border-zinc-800 mx-3 mt-1" />
            )}
            {macroItems.map((item, i) => (
                <PinnedQuoteCard
                    key={item.id}
                    item={item}
                    showDivider={i > 0 && marketItems.length === 0}
                    onRemove={() => onRemove(item.id)}
                />
            ))}
        </div>
    );
}
