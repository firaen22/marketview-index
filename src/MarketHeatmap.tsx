import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

export const transformToTreemap = (data: any[], groupBy: 'category' | 'subCategory' = 'category') => {
    const categories = data.reduce((acc: any, item: any) => {
        const cat = item[groupBy] || 'Other';
        if (!acc[cat]) acc[cat] = { name: cat, children: [] };

        acc[cat].children.push({
            name: item.name,
            symbol: item.symbol,
            size: item.category === 'Crypto' ? Math.log10(item.price) * 10 : 100, // Balanced sizes
            change: item.changePercent,
            isPositive: item.changePercent >= 0,
        });
        return acc;
    }, {});

    return Object.values(categories);
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-zinc-800/95 border border-zinc-700/50 p-2.5 rounded-lg shadow-xl text-xs font-mono z-50">
                <p className="text-zinc-400 mb-1">{data.symbol || data.name}</p>
                <p className="font-bold text-zinc-100 text-sm mb-1">{data.name}</p>
                <p className={data.change >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {data.change > 0 ? '+' : ''}{data.change?.toFixed(2)}%
                </p>
            </div>
        );
    }
    return null;
};

const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, change } = props;

    const getBgColor = (val: number) => {
        if (val >= 3) return '#059669';      // Deep Green
        if (val >= 1.5) return '#10b981';    // Strong Green
        if (val > 0) return '#34d399';       // Light Green
        if (val <= -3) return '#b91c1c';     // Deep Red
        if (val <= -1.5) return '#ef4444';   // Strong Red
        if (val < 0) return '#fb7185';       // Light Red
        return '#27272a';                    // Gray (Neutral)
    };

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: getBgColor(change),
                    stroke: '#09090b',
                    strokeWidth: width > 100 ? 3 : 1,
                }}
            />
            {width > 60 && height > 40 && (
                <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="white" className="select-none">
                    <tspan x={x + width / 2} dy="-0.2em" fontSize={width > 120 ? 16 : 12} fontWeight="900">
                        {name.split(' ')[0]}
                    </tspan>
                    <tspan x={x + width / 2} dy="1.4em" fontSize={10} fontWeight="600" fillOpacity={0.9}>
                        {change > 0 ? '+' : ''}{change?.toFixed(2)}%
                    </tspan>
                </text>
            )}
        </g>
    );
};

export const MarketHeatmap = ({ rawData, groupBy = 'category' }: { rawData: any[], groupBy?: 'category' | 'subCategory' }) => {
    const data = transformToTreemap(rawData, groupBy);

    if (!rawData || rawData.length === 0) {
        return null;
    }

    return (
        <div className="h-[400px] w-full bg-zinc-900/30 rounded-xl border border-zinc-800 p-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
                <Treemap
                    data={data as any[]}
                    dataKey="size"
                    stroke="#fff"
                    fill="#8884d8"
                    content={<CustomizedContent />}
                    isAnimationActive={false}
                >
                    <Tooltip content={<CustomTooltip />} />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
};

export default MarketHeatmap;
