import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatPrice } from '../utils';
import type { IndexData } from '../types';
import type { TDict } from '../locales';

export const TickerItem: React.FC<{ item: IndexData; t: TDict }> = React.memo(({ item, t }) => {
    const isPositive = item.change >= 0;
    const translated = t?.indexNames?.[item.name];
    return (
        <div className="flex items-center space-x-4 px-6 py-2 border-r border-zinc-800 whitespace-nowrap">
            <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-400">{item.symbol}</span>
                <span className="text-sm font-semibold text-zinc-100">
                    {translated || item.nameEn || item.name}
                </span>
            </div>
            <div className="flex flex-col items-end">
                <span className="text-sm font-mono font-medium text-zinc-100">{formatPrice(item.price)}</span>
                <div className={cn("flex items-center text-xs font-mono", isPositive ? "text-emerald-400" : "text-rose-400")}>
                    {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    <span>{isPositive ? '+' : ''}{item.change.toFixed(2)} ({isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%)</span>
                </div>
            </div>
        </div>
    );
});
TickerItem.displayName = 'TickerItem';
