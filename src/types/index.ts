export type TimeRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

export type IndexCategory = 'US' | 'Europe' | 'Asia' | 'Commodity' | 'Crypto' | 'Currency' | 'Volatility' | 'Fund';

export interface HistoryPoint {
    value: number;
    date?: string;
}

export interface IndexData {
    symbol: string;
    name: string;
    nameEn?: string;
    price: number;
    change: number;
    changePercent: number;
    ytdChange: number;
    ytdChangePercent: number;
    open: number;
    high: number;
    low: number;
    history: HistoryPoint[];
    category: IndexCategory;
    subCategory?: string;
}

export interface NewsItem {
    id: string;
    source: string;
    time: string;
    title: string;
    summary: string;
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    sentimentScore: number;
    url: string;
}

/**
 * Values api/market-data.ts actually emits. The union previously listed 'live',
 * which is never sent, and omitted the three fresh-fetch sources — so a consumer
 * switching on it could be exhaustive against the type and still miss reality.
 *   server_cache       — served from the warm Redis cache (api/market-data.ts:110)
 *   cron_updated_cache — refreshed by the scheduled cron run (:132)
 *   live_api_cached    — fetched upstream and written to Redis (:132)
 *   live_api_no_redis  — fetched upstream with no Redis configured (:132)
 *   server_stale_cache — upstream failed; frozen snapshot, sent with success:false (:165)
 */
export type MarketDataSource =
    | 'server_cache'
    | 'cron_updated_cache'
    | 'live_api_cached'
    | 'live_api_no_redis'
    | 'server_stale_cache';

export interface MarketDataResponse {
    success: boolean;
    data: IndexData[];
    timestamp?: string;
    source?: MarketDataSource;
    error?: string;
}

export interface MarketNewsResponse {
    success: boolean;
    data: NewsItem[];
    marketSummary?: string;
    isAiTranslated?: boolean;
    timestamp?: string;
    error?: string;
}

export interface MacroData {
    symbol: string;
    name: string;
    nameEn: string;
    value: number;
    prevValue?: number;
    change: number;
    changePercent: number;
    momChangePercent?: number;
    changeLabel?: string;
    secondaryLabel?: string;
    date: string;
    category: string;
}

export interface MacroDataResponse {
    success: boolean;
    data: MacroData[];
    timestamp?: string;
    error?: string;
}

// Re-export QuoteItem types
export { type QuoteItem, type QuoteGroup, indexToQuoteItem, macroToQuoteItem } from './QuoteItem';
