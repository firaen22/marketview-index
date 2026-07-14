import { useCallback, useRef, useState } from 'react';
import type { NewsItem } from '../types';

interface Options {
    language: 'en' | 'zh-TW';
    geminiKey: string;
}

export interface UseNewsDataResult {
    newsData: NewsItem[];
    isNewsLoading: boolean;
    isAiTranslated: boolean;
    marketSummary: string;
    fetchNews: (langStr: 'en' | 'zh-TW', overrideKey: string | undefined, isBackground: boolean, forceRefresh: boolean) => Promise<void>;
    refreshNewsWithKey: (key: string) => void;
}

export function useNewsData({ language, geminiKey }: Options): UseNewsDataResult {
    const [newsData, setNewsData] = useState<NewsItem[]>([]);
    const [isNewsLoading, setIsNewsLoading] = useState(true);
    const [isAiTranslated, setIsAiTranslated] = useState(true);
    const [marketSummary, setMarketSummary] = useState<string>('');
    const requestSeqRef = useRef(0);
    // Tracked separately so a background poll can't strand the spinner: only the
    // latest FOREGROUND request may clear isNewsLoading.
    const foregroundSeqRef = useRef(0);

    const fetchNews = useCallback(async (
        langStr: 'en' | 'zh-TW',
        overrideKey: string | undefined,
        isBackground: boolean,
        forceRefresh: boolean
    ) => {
        if (!isBackground) setIsNewsLoading(true);
        const activeKey = overrideKey !== undefined ? overrideKey : geminiKey;
        const seq = ++requestSeqRef.current;
        if (!isBackground) foregroundSeqRef.current = seq;
        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;
            const url = `/api/market-news?t=${Date.now()}&lang=${langStr}${forceRefresh ? '&refresh=true' : ''}`;
            const response = await fetch(url, { headers });
            if (!response.ok) return;
            const result = await response.json();
            if (seq !== requestSeqRef.current) return;
            setIsAiTranslated(result.isAiTranslated !== false);
            setMarketSummary(result.marketSummary || '');
            if (result.data && Array.isArray(result.data)) {
                setNewsData(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch news data:', err);
        } finally {
            if (!isBackground && seq === foregroundSeqRef.current) setIsNewsLoading(false);
        }
    }, [geminiKey]);

    const refreshNewsWithKey = useCallback((key: string) => {
        fetchNews(language, key, false, true);
    }, [language, fetchNews]);

    return { newsData, isNewsLoading, isAiTranslated, marketSummary, fetchNews, refreshNewsWithKey };
}
