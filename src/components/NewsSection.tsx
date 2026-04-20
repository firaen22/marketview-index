import { LayoutDashboard, Loader2, ShieldAlert } from 'lucide-react';
import MarketHeatmap from '../MarketHeatmap';
import { Badge, ScrollArea } from './ui';
import { NewsCard } from './NewsCard';
import { DailyPulse } from './DailyPulse';
import { cn } from '../utils';
import type { IndexData, NewsItem } from '../types';

interface Props {
    isNewsOnly: boolean;
    isNewsLoading: boolean;
    isAiTranslated: boolean;
    language: 'en' | 'zh-TW';
    marketSummary: string;
    marketData: IndexData[];
    newsData: NewsItem[];
    t: any;
}

export function NewsSection({
    isNewsOnly,
    isNewsLoading,
    isAiTranslated,
    language,
    marketSummary,
    marketData,
    newsData,
    t,
}: Props) {
    return (
        <div className={cn(
            "flex flex-col animate-in fade-in duration-500",
            isNewsOnly ? "lg:col-span-12" : "lg:col-span-5 xl:col-span-4 lg:order-last h-[calc(100vh-var(--dash-offset,180px))]"
        )}>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center text-balance">
                    <span className="w-1 h-6 bg-blue-500 mr-3 rounded-full"></span>
                    {t.news}
                </h2>
                {!isAiTranslated && language === 'zh-TW' && (
                    <div className="flex items-center text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded border border-amber-500/20 max-w-[150px] leading-tight">
                        <ShieldAlert className="w-3 h-3 mr-1 flex-shrink-0" />
                        {t.noAiWarning}
                    </div>
                )}
                <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">{t.poweredBy}</span>
                    <Badge variant="default" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{t.liveFeed}</Badge>
                </div>
            </div>

            <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-1">
                    {isNewsLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p className="text-sm">{t.newsLoading}</p>
                        </div>
                    ) : (
                        <>
                            <DailyPulse summary={marketSummary} t={t} isFocusMode={isNewsOnly} />

                            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                                <h3 className="text-lg font-bold mb-3 flex items-center text-zinc-200">
                                    <LayoutDashboard className="w-4 h-4 mr-2 text-blue-400" />
                                    {t.globalHeatmap}
                                </h3>
                                <MarketHeatmap rawData={marketData} groupBy="category" />
                            </div>

                            <div className={cn(
                                "grid gap-x-6",
                                isNewsOnly ? "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1"
                            )}>
                                {newsData.length > 0 ? (
                                    newsData.map((news) => (
                                        <NewsCard key={news.id} item={news} language={language} isFocusMode={isNewsOnly} />
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-48 text-zinc-500 border border-dashed border-zinc-800 rounded-xl lg:col-span-full">
                                        <p className="text-sm">{t.noNews}</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
