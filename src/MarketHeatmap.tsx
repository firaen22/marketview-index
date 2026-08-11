import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import type { IndexData } from './types';
import { useRootScale } from './hooks/useViewportScale';

interface TreemapLeaf {
    name: string;
    symbol: string;
    size: number;
    change: number;
    isPositive: boolean;
    [key: string]: string | number | boolean;
}

interface TreemapNode {
    name: string;
    children: TreemapLeaf[];
    [key: string]: string | number | TreemapLeaf[];
}

export const transformToTreemap = (
    data: IndexData[],
    groupBy: 'category' | 'subCategory' = 'category',
    language: 'en' | 'zh-TW' = 'zh-TW'
): TreemapNode[] => {
    const categories = data
        .filter(item => item.symbol !== '^VIX')
        .reduce<Record<string, TreemapNode>>((acc, item) => {
            const cat = (groupBy === 'category' ? item.category : item.subCategory) || 'Other';
            if (!acc[cat]) acc[cat] = { name: cat, children: [] };

            acc[cat].children.push({
                name: language === 'en' ? (item.nameEn || item.name) : item.name,
                symbol: item.symbol,
                size: item.category === 'Crypto' && Number.isFinite(item.price) && item.price > 0 ? Math.log10(item.price) * 10 : 100,
                change: item.changePercent,
                isPositive: item.changePercent >= 0,
            });
            return acc;
        }, {});

    return Object.values(categories);
};

interface HeatmapTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: TreemapLeaf }>;
}

export const CustomTooltip = ({ active, payload }: HeatmapTooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        // Recharts also routes category parent nodes here; they have no change value.
        if (typeof data.change !== 'number') return null;
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

interface TreemapContentProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    change?: number;
    /** Root font scale (1 at 1080p and below, 2 at 4K). Supplied by the parent
     *  rather than read from a hook here: Recharts clones this element for every
     *  cell, and cloned content must stay a plain render function. */
    scale?: number;
}

const CustomizedContent = (props: TreemapContentProps) => {
    const { x = 0, y = 0, width = 0, height = 0, name = '', change = 0, scale = 1 } = props;
    // Cell geometry arrives in real rendered pixels, which already grow with the
    // container at 4K — so the legibility thresholds have to grow with it too,
    // otherwise every cell would qualify for the large label at high resolution.
    const px = (n: number) => n * scale;

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
                    strokeWidth: width > px(100) ? px(3) : px(1),
                }}
            />
            {width > px(60) && height > px(40) && (
                <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="white" className="select-none">
                    <tspan x={x + width / 2} dy="-0.2em" fontSize={width > px(120) ? px(16) : px(12)} fontWeight="900">
                        {name.split(' ')[0]}
                    </tspan>
                    <tspan x={x + width / 2} dy="1.4em" fontSize={px(10)} fontWeight="600" fillOpacity={0.9}>
                        {change > 0 ? '+' : ''}{change?.toFixed(2)}%
                    </tspan>
                </text>
            )}
        </g>
    );
};

export const MarketHeatmap = ({ rawData, groupBy = 'category', language = 'zh-TW' }: { rawData: IndexData[], groupBy?: 'category' | 'subCategory', language?: 'en' | 'zh-TW' }) => {
    // Ahead of the empty-data early return: hooks cannot sit behind a branch.
    const scale = useRootScale();
    const data = transformToTreemap(rawData, groupBy, language);

    if (!rawData || rawData.length === 0) {
        return null;
    }

    // Flex column, not a bare block: ResponsiveContainer's height:100% resolves against the
    // parent's *specified* height, which is `auto` wherever this is dropped into a call site
    // without a fixed height (NewsSection, FundsPage) — min-h alone leaves it 0-high. As a flex
    // item it sizes off the root's used height instead, so both the min-h fallback and an
    // explicit parent height (HeatmapPage's h-[650px]) work.
    return (
        <div className="flex flex-col h-full min-h-[25rem] w-full bg-zinc-900/30 rounded-xl border border-zinc-800 p-2 overflow-hidden">
            <ResponsiveContainer className="flex-1 min-h-0" width="100%" height="100%">
                <Treemap
                    data={data}
                    dataKey="size"
                    stroke="#fff"
                    fill="#8884d8"
                    content={<CustomizedContent scale={scale} />}
                    isAnimationActive={false}
                >
                    <Tooltip content={<CustomTooltip />} />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
};

export default MarketHeatmap;
