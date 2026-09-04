import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatPrice, formatSigned } from '../utils';
import type { IndexData } from '../types';
import type { TDict } from '../locales';

export const TickerItem: React.FC<{ item: IndexData; t: TDict }> = React.memo(({ item, t }) => {
    const isPositive = item.change >= 0;
    const translated = t?.indexNames?.[item.name];
    return (
        <div className="flex items-center space-x-4 px-6 py-2 border-r border-zinc-800 whitespace-nowrap">
            <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-400">
                    {item.symbol}
                    {/* The ticker is the only market surface visible when the
                        projector strip is collapsed, so a frozen price has to
                        carry the same cue the cards do — otherwise the run is
                        showing stale data with no banner at all. */}
                    {item.stale && (
                        <span
                            className="ml-1.5 whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 align-middle"
                            title={t.dataFreshness?.stale ?? 'Delayed'}
                        >
                            {t.dataFreshness?.stale ?? 'Delayed'}
                        </span>
                    )}
                </span>
                <span className="text-sm font-semibold text-zinc-100">
                    {translated || item.nameEn || item.name}
                </span>
            </div>
            <div className="flex flex-col items-end">
                <span className="text-sm font-mono font-medium text-zinc-100">{formatPrice(item.price)}</span>
                <div className={cn("flex items-center text-xs font-mono", isPositive ? "text-emerald-400" : "text-rose-400")}>
                    {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    <span>{formatSigned(item.change)} ({formatSigned(item.changePercent)}%)</span>
                </div>
            </div>
        </div>
    );
});
TickerItem.displayName = 'TickerItem';
