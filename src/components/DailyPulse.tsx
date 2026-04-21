import { TrendingUp, Cpu } from 'lucide-react';
import { cn } from '../utils';
import type { TDict } from '../locales';

export const DailyPulse = ({ summary, t, isFocusMode }: { summary: string; t: TDict; isFocusMode: boolean }) => {
    if (!summary) return null;

    let overview = summary;
    let highlights: string[] = [];

    if (summary.includes('[OVERVIEW]')) {
        const parts = summary.split('[HIGHLIGHTS]');
        overview = parts[0].replace('[OVERVIEW]', '').trim();
        if (parts[1]) {
            highlights = parts[1].split('\n')
                .map(h => h.trim())
                .filter(h => h.startsWith('-'))
                .map(h => h.substring(1).trim());
        }
    }

    return (
        <div className={cn(
            "mb-6 p-5 rounded-xl border relative overflow-hidden group transition-all duration-500",
            isFocusMode
                ? "border-blue-500/30 bg-blue-500/10 shadow-2xl shadow-blue-900/10 py-8"
                : "border-blue-500/20 bg-blue-500/5 backdrop-blur-sm"
        )}>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp className={cn("text-blue-500", isFocusMode ? "w-24 h-24" : "w-12 h-12")} />
            </div>
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1 px-2 rounded-md bg-blue-500/20 text-blue-400 flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.dailyPulse}</span>
                </div>
                {isFocusMode && <div className="h-px flex-1 bg-blue-500/20"></div>}
            </div>

            <div className={cn("space-y-4", isFocusMode ? "max-w-4xl" : "")}>
                <p className={cn(
                    "text-zinc-200 leading-relaxed font-semibold mb-4",
                    isFocusMode ? "text-lg md:text-xl" : "text-sm"
                )}>
                    {overview}
                </p>

                {highlights.length > 0 && (
                    <div className={cn(
                        "grid gap-3 animate-in fade-in slide-in-from-left-4 duration-700",
                        isFocusMode ? "grid-cols-1 md:grid-cols-3 mt-8" : "grid-cols-1"
                    )}>
                        {highlights.map((h, i) => (
                            <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-black/20 border border-white/5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                <p className="text-sm text-zinc-300 leading-tight font-medium">{h}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
