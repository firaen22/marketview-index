import type { HistoryPoint, IndexData, MacroData } from './index';

export type QuoteGroup = 'market' | 'macro';

export interface QuoteItem {
    id: string;              // symbol
    name: string;
    value: number;
    changePct: number;
    changeLabel?: string;    // undefined for market, "YoY" for macro
    secondaryPct?: number;   // momChangePercent for macro
    secondaryLabel?: string; // "MoM" for macro
    history?: HistoryPoint[];
    group: QuoteGroup;
}

export function indexToQuoteItem(d: IndexData): QuoteItem {
    return {
        id: d.symbol,
        name: d.name,
        value: d.price,
        changePct: d.changePercent,
        history: d.history,
        group: 'market',
    };
}

export function macroToQuoteItem(d: MacroData): QuoteItem {
    return {
        id: d.symbol,
        name: d.name,
        value: d.value,
        changePct: d.changePercent,
        changeLabel: 'YoY',
        secondaryPct: d.momChangePercent,
        secondaryLabel: 'MoM',
        group: 'macro',
    };
}
