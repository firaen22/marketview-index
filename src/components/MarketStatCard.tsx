import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { cn, displayName, formatPrice } from '../utils';
import { Card } from './ui';
import type { IndexData, HistoryPoint } from '../types';
import type { TDict } from '../locales';

interface StatTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: HistoryPoint }>;
}

const CustomTooltip = ({ active, payload }: StatTooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const dateStr = data.date ? new Date(data.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Live';
        return (
            <div className="bg-zinc-800/95 border border-zinc-700/50 p-2.5 rounded-lg shadow-xl text-xs font-mono z-50 animate-in fade-in zoom-in-95 duration-200">
                <p className="text-zinc-400 mb-1">{dateStr}</p>
                <p className="font-bold text-zinc-100 text-sm">{formatPrice(Number(data.value))}</p>
            </div>
        );
    }
    return null;
};

export const MarketStatCard: React.FC<{
    item: IndexData;
    chartHeight?: string;
    t: TDict;
    chartMode?: 'nominal' | 'percent';
}> = ({ item, chartHeight = "h-16", t, chartMode = 'nominal' }) => {
    const isPositive = item.change >= 0;
    const isYtdPositive = item.ytdChange >= 0;

    // Transform data if in percent mode
    const chartData = React.useMemo(() => {
        if (chartMode === 'percent' && item.history.length > 0) {
            const baseValue = item.history[0].value;
            if (baseValue === 0) return item.history;
            return item.history.map(pt => ({
                ...pt,
                value: ((pt.value - baseValue) / baseValue) * 100
            }));
        }
        return item.history;
    }, [item.history, chartMode]);

    return (
        <Card className="p-4 flex flex-col justify-between h-full border-zinc-800/60 transition-all duration-300 hover:border-zinc-700/50">
            <div className="grid grid-cols-[1fr_auto] gap-x-2 items-start mb-5">
                <div className="min-w-0">
                    <h4 className="font-bold text-zinc-100 text-sm leading-tight mb-1 line-clamp-2">
                        {t?.indexNames?.[item.name] || displayName(item, t.language)}
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{item.symbol}</span>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className={cn("text-base font-mono font-bold leading-none", isPositive ? "text-emerald-400" : "text-rose-400")}>
                        {formatPrice(item.price)}
                    </div>
                    <div className={cn("text-[10px] font-mono flex items-center justify-end mt-1 px-1.5 py-0.5 rounded bg-zinc-950/50", isPositive ? "text-emerald-400" : "text-rose-400")}>
                        {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div className={cn("w-full mb-5 transition-all", chartHeight)}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={isPositive ? "#34d399" : "#fb7185"}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: isPositive ? "#34d399" : "#fb7185", stroke: "#18181b", strokeWidth: 2 }}
                        />
                        <XAxis dataKey="date" hide />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }}
                            formatter={(val: number) => [
                                chartMode === 'percent' ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : val.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                                "Value"
                            ]}
                        />
                        <YAxis
                            domain={[
                                (dataMin: number) => dataMin - (Math.abs(dataMin) * 0.1),
                                (dataMax: number) => dataMax + (Math.abs(dataMax) * 0.1)
                            ]}
                            hide
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="flex justify-between items-end text-[10px] border-t border-zinc-800/80 pt-3">
                <div className="flex flex-col">
                    <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">
                        {t.rangeLabels?.[t.activeRange] || t.ytd}
                    </span>
                    <span className={cn("font-mono font-medium text-xs", isYtdPositive ? "text-emerald-400" : "text-rose-400")}>
                        {isYtdPositive ? '+' : ''}{item.ytdChangePercent.toFixed(2)}%
                    </span>
                </div>
                <div className="text-right flex flex-col">
                    <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">{t.range}</span>
                    <span className="font-mono text-zinc-100 text-[11px] leading-tight">
                        {item.low.toLocaleString(undefined, { maximumFractionDigits: 0 })}<br />
                        <span className="text-zinc-500 opacity-50">—</span><br />
                        {item.high.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                </div>
            </div>
        </Card>
    );
};
