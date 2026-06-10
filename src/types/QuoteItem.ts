import type { HistoryPoint, IndexData, MacroData } from './index';

export type QuoteGroup = 'market' | 'macro';

export interface QuoteItem {
    id: string;              // symbol
    name: string;
    nameEn?: string;
    value: number;
    changePct: number;
    changeLabel?: string;    // undefined for market, "YoY" for macro
    secondaryPct?: number;   // momChangePercent for macro
    secondaryLabel?: string; // "MoM" for macro
    ytdPct?: number;         // ytdChangePercent for market items
    history?: HistoryPoint[];
    group: QuoteGroup;
}

export function indexToQuoteItem(d: IndexData): QuoteItem {
    return {
        id: d.symbol,
        name: d.name,
        nameEn: d.nameEn,
        value: d.price,
        changePct: d.changePercent,
        ytdPct: d.ytdChangePercent,
        history: d.history,
        group: 'market',
    };
}

export function macroToQuoteItem(d: MacroData): QuoteItem {
    return {
        id: d.symbol,
        name: d.name,
        nameEn: d.nameEn,
        value: d.value,
        changePct: d.changePercent,
        changeLabel: d.changeLabel ?? 'YoY',
        secondaryPct: d.momChangePercent,
        secondaryLabel: d.secondaryLabel ?? 'MoM',
        group: 'macro',
    };
}
