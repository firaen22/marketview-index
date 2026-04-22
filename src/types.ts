export type TimeRange = '1M' | '3M' | 'YTD' | '1Y';

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

export interface MarketDataResponse {
    success: boolean;
    data: IndexData[];
    timestamp?: string;
    source?: 'server_cache' | 'server_stale_cache' | 'live';
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
    prevValue: number;
    change: number;
    changePercent: number;
    momChangePercent?: number;
    date: string;
    category: string;
}

export interface MacroDataResponse {
    success: boolean;
    data: MacroData[];
    timestamp?: string;
    error?: string;
}
