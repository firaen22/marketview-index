import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

export const transformToTreemap = (data: any[], groupBy: 'category' | 'subCategory' = 'category') => {
    const categories = data.reduce((acc: any, item: any) => {
        const cat = item[groupBy] || 'Other';
        if (!acc[cat]) acc[cat] = { name: cat, children: [] };

        acc[cat].children.push({
            name: item.name,
            symbol: item.symbol,
            size: Math.abs(item.price) || 100, // Using price for size
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

    // Finviz style colors
    const getBgColor = (val: number) => {
        if (val >= 2) return '#065f46';   // Deep Green
        if (val > 0) return '#059669';    // Light Green
        if (val <= -2) return '#9f1239';  // Deep Red
        if (val < 0) return '#e11d48';    // Light Red
        return '#27272a';                 // Gray (Neutral)
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
                    strokeWidth: 2,
                }}
            />
            {width > 50 && height > 30 && (
                <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="white" fontSize={12} className="font-bold">
                    {name}
                    <tspan x={x + width / 2} dy="1.2em" fontSize={10} fillOpacity={0.8}>
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
