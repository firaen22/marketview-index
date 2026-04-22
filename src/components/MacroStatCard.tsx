import React from 'react';
import { Card } from './ui';
import { cn } from '../utils';
import type { MacroData } from '../types';
import type { TDict } from '../locales';

export const MacroStatCard: React.FC<{
    item: MacroData;
    t: TDict;
}> = ({ item, t }) => {
    const isYoyPositive = item.changePercent >= 0;
    const isMomPositive = (item.momChangePercent || 0) >= 0;

    const lang = t.language === 'zh-TW' ? 'zh-TW' : 'en';
    const displayName = lang === 'zh-TW' ? item.name : item.nameEn;
    const formattedDate = new Date(item.date).toLocaleDateString(lang === 'zh-TW' ? 'zh-TW' : 'en-US', {
        year: 'numeric',
        month: 'short'
    });

    return (
        <Card className="p-4 flex flex-col justify-between h-full border-zinc-800/60 transition-all duration-300 hover:border-zinc-700/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-x-2 items-start mb-4 relative z-10">
                <div className="min-w-0">
                    <h4 className="font-bold text-zinc-100 text-sm leading-tight mb-1 line-clamp-2">
                        {displayName}
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{item.symbol}</span>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className="text-xl font-mono font-bold leading-none text-zinc-100">
                        {item.value.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1">
                        {formattedDate}
                    </div>
                </div>
            </div>

            <div className="flex-1"></div>

            <div className="flex justify-between items-end text-[10px] border-t border-zinc-800/80 pt-3 relative z-10 mt-4">
                <div className="flex flex-col">
                    <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">
                        {t.yoyChange || 'YoY Change'}
                    </span>
                    <span className={cn("font-mono font-medium text-xs", isYoyPositive ? "text-emerald-400" : "text-rose-400")}>
                        {isYoyPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
                    </span>
                </div>
                <div className="text-right flex flex-col">
                    <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">
                        {t.momChange || 'MoM Change'}
                    </span>
                    <span className={cn("font-mono font-medium text-xs", isMomPositive ? "text-emerald-400" : "text-rose-400")}>
                        {isMomPositive ? '+' : ''}{(item.momChangePercent || 0).toFixed(2)}%
                    </span>
                </div>
            </div>
        </Card>
    );
};
