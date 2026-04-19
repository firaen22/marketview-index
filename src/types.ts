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
    history: { value: number; date?: string }[];
    category: 'US' | 'Europe' | 'Asia' | 'Commodity' | 'Crypto' | 'Currency' | 'Volatility' | 'Fund';
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
