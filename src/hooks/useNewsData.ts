import { useCallback, useEffect, useRef, useState } from 'react';
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
    // Foreground and background aborts are tracked separately: a background
    // poll must never kill a user-initiated foreground fetch mid-flight.
    const fgAbortRef = useRef<AbortController | null>(null);
    const bgAbortRef = useRef<AbortController | null>(null);

    const fetchNews = useCallback(async (
        langStr: 'en' | 'zh-TW',
        overrideKey: string | undefined,
        isBackground: boolean,
        forceRefresh: boolean
    ) => {
        const abortRef = isBackground ? bgAbortRef : fgAbortRef;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        if (!isBackground) setIsNewsLoading(true);
        const activeKey = overrideKey !== undefined ? overrideKey : geminiKey;
        const seq = ++requestSeqRef.current;
        if (!isBackground) foregroundSeqRef.current = seq;
        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;
            const url = `/api/market-news?t=${Date.now()}&lang=${langStr}${forceRefresh ? '&refresh=true' : ''}`;
            const response = await fetch(url, { headers, signal: controller.signal });
            if (!response.ok) return;
            const result = await response.json();
            // Path-aware supersession: a background poll must not discard a
            // resolved foreground refresh (its data may be a staler cache hit).
            // Foreground results stand unless a NEWER foreground superseded
            // them; background results stand only if nothing newer started.
            if (isBackground ? seq !== requestSeqRef.current : seq !== foregroundSeqRef.current) return;
            setIsAiTranslated(result.isAiTranslated !== false);
            setMarketSummary(result.marketSummary || '');
            if (result.data && Array.isArray(result.data)) {
                setNewsData(result.data);
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            console.error('Failed to fetch news data:', err);
        } finally {
            if (!isBackground && seq === foregroundSeqRef.current) setIsNewsLoading(false);
        }
    }, [geminiKey]);

    useEffect(() => {
        return () => {
            fgAbortRef.current?.abort();
            bgAbortRef.current?.abort();
        };
    }, []);

    const refreshNewsWithKey = useCallback((key: string) => {
        fetchNews(language, key, false, true);
    }, [language, fetchNews]);

    return { newsData, isNewsLoading, isAiTranslated, marketSummary, fetchNews, refreshNewsWithKey };
}
