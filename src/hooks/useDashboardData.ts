import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndexData, MarketDataResponse } from '../types';
import { marketCacheKey } from '../settings';
import { useNewsData } from './useNewsData';

interface Options {
    timeRange: string;
    language: 'en' | 'zh-TW';
    geminiKey: string;
    lastUpdatedLabel: string;
}

interface Result {
    marketData: IndexData[];
    isLoading: boolean;
    isError: boolean;
    fallbackMessage: string | null;
    lastUpdated: Date | null;
    newsData: import('../types').NewsItem[];
    isNewsLoading: boolean;
    isAiTranslated: boolean;
    marketSummary: string;
    refresh: () => void;
    refreshNewsWithKey: (key: string) => void;
}

const POLL_MS = 60 * 60 * 1000;

export function useDashboardData({ timeRange, language, geminiKey, lastUpdatedLabel }: Options): Result {
    const [marketData, setMarketData] = useState<IndexData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const requestControllerRef = useRef<AbortController | null>(null);
    const requestSequenceRef = useRef(0);

    const { newsData, isNewsLoading, isAiTranslated, marketSummary, fetchNews, refreshNewsWithKey } =
        useNewsData({ language, geminiKey });

    const handleFallback = useCallback((cacheKey: string, message: string) => {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                const timeStr = new Date(timestamp).toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : undefined);
                setMarketData(data);
                setLastUpdated(new Date(timestamp));
                setFallbackMessage(`${message} (${lastUpdatedLabel}: ${timeStr})`);
            } catch {
                setIsError(true);
                setMarketData([]);
            }
        } else {
            setIsError(true);
            setMarketData([]);
        }
    }, [language, lastUpdatedLabel]);

    const fetchMarketData = useCallback(async (
        rangeStr: string,
        isBackground: boolean,
        forceRefresh: boolean,
        overrideLang: 'en' | 'zh-TW'
    ) => {
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const requestSequence = ++requestSequenceRef.current;
        const CACHE_KEY = marketCacheKey(rangeStr, overrideLang);
        if (!isBackground) {
            setIsLoading(true);
            setIsError(false);
            setFallbackMessage(null);
        }
        try {
            const url = `/api/market-data?t=${Date.now()}&range=${rangeStr}&lang=${overrideLang}${forceRefresh ? '&refresh=true' : ''}`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result: MarketDataResponse = await response.json();
            if (requestSequence !== requestSequenceRef.current) return;
            if (result.data && Array.isArray(result.data)) {
                setMarketData(result.data);
                if (!result.success || result.source === 'server_stale_cache') {
                    const timestamp = new Date(result.timestamp || '');
                    const timeStr = Number.isNaN(timestamp.getTime())
                        ? ''
                        : timestamp.toLocaleTimeString(overrideLang === 'zh-TW' ? 'zh-TW' : undefined);
                    setFallbackMessage(overrideLang === 'en'
                        ? `Could not get latest data, showing backend last updated${timeStr ? `: ${timeStr}` : ''} (Global data frozen)`
                        : `無法取得最新資料，顯示後端最後更新時間${timeStr ? `：${timeStr}` : ''} (全局資料已凍結)`);
                } else {
                    setFallbackMessage(null);
                    setIsError(false);
                    const timestamp = new Date(result.timestamp || '');
                    setLastUpdated(Number.isNaN(timestamp.getTime()) ? null : timestamp);
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        data: result.data,
                    }));
                }
            } else {
                throw new Error(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            if (requestSequence !== requestSequenceRef.current) return;
            console.error('Failed to fetch market data:', err);
            handleFallback(CACHE_KEY, overrideLang === 'en'
                ? 'Server connection failed. Showing device local cache.'
                : '伺服器連線失敗。顯示裝置本地快取。');
        } finally {
            if (requestSequence === requestSequenceRef.current) setIsLoading(false);
        }
    }, [handleFallback]);

    useEffect(() => {
        fetchMarketData(timeRange, false, false, language);
        fetchNews(language, undefined, false, false);
        const id = setInterval(() => {
            fetchMarketData(timeRange, true, false, language);
            fetchNews(language, undefined, true, false);
        }, POLL_MS);
        return () => {
            requestControllerRef.current?.abort();
            clearInterval(id);
        };
    }, [timeRange, language, fetchMarketData, fetchNews]);

    const refresh = useCallback(() => {
        fetchMarketData(timeRange, false, true, language);
        fetchNews(language, undefined, false, true);
    }, [timeRange, language, fetchMarketData, fetchNews]);

    return {
        marketData, isLoading, isError, fallbackMessage, lastUpdated,
        newsData, isNewsLoading, isAiTranslated, marketSummary,
        refresh, refreshNewsWithKey,
    };
}
