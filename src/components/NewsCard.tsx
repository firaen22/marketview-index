import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../utils';
import { Card, Badge } from './ui';
import type { NewsItem } from '../types';

const SENTIMENT_LABELS: Record<string, Record<string, string>> = {
    en: { Bullish: 'Bullish', Bearish: 'Bearish', Neutral: 'Neutral' },
    'zh-TW': { Bullish: '看漲', Bearish: '看跌', Neutral: '中立' },
};

export const NewsCard: React.FC<{ item: NewsItem; language: string; isFocusMode?: boolean }> = ({ item, language, isFocusMode }) => {
    const sentimentVariant = item.sentiment.toLowerCase() as 'bullish' | 'bearish' | 'neutral';
    const label = SENTIMENT_LABELS[language]?.[item.sentiment] || item.sentiment;

    return (
        <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="block outline-none mb-4">
            <Card className="p-4 hover:bg-zinc-900 transition-colors cursor-pointer group border-zinc-800/60 h-full">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-400">{item.source}</span>
                        <span>•</span>
                        <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{item.time}</span>
                    </div>
                    <Badge variant={sentimentVariant}>{label}</Badge>
                </div>
                <h3 className={cn(
                    "font-bold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors leading-tight text-balance",
                    isFocusMode ? "text-xl" : "text-lg"
                )}>
                    {item.title}
                </h3>
                <p className={cn(
                    "text-sm text-zinc-400 leading-relaxed",
                    isFocusMode ? "" : "line-clamp-2"
                )}>
                    {item.summary}
                </p>
            </Card>
        </a>
    );
};
