import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndexData, MarketDataResponse } from '../types';
import { marketCacheKey } from '../settings';

interface Options {
    range: string;
    /** Must be referentially stable (useCallback/module-level) — it is a dependency of the fetch effect. */
    filter?: (item: IndexData) => boolean;
    lang?: 'en' | 'zh-TW';
    refreshMs?: number;
}

interface Result {
    data: IndexData[];
    isLoading: boolean;
    error: boolean;
    refresh: (force?: boolean) => Promise<void>;
}

/**
 * Simple market-data fetcher for pages that don't need Dashboard's
 * full feature set (stale-cache detection, bilingual error messaging, news).
 * Seeds initial state from Dashboard's localStorage cache when `lang` is
 * provided, so consumers get immediate data if the Dashboard has been visited.
 *
 * For the full-featured version see useDashboardData.
 */
function seedFromCache(range: string, lang: 'en' | 'zh-TW' | undefined, filter?: (item: IndexData) => boolean): IndexData[] {
    if (!lang) return [];
    try {
        const raw = localStorage.getItem(marketCacheKey(range, lang));
        if (raw) {
            const { data: cached } = JSON.parse(raw);
            if (Array.isArray(cached)) return filter ? cached.filter(filter) : cached;
        }
    } catch {}
    return [];
}

export function useMarketData({ range, filter, lang, refreshMs }: Options): Result {
    const [data, setData] = useState<IndexData[]>(() => seedFromCache(range, lang, filter));
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestSeqRef = useRef(0);

    // On a range switch, the held data belongs to the OLD range — showing its
    // percentages until the refetch lands is stale-without-banner (a heatmap of
    // wrong-range numbers on a live projector). Reset to the new range's cached
    // seed (or empty) so length-gated loading guards show a spinner instead.
    // Interval/background refreshes keep the same range, so they never clear —
    // the embedded projector's 5-min refresh stays flash-free.
    const isFirstRangeRef = useRef(true);
    useEffect(() => {
        if (isFirstRangeRef.current) { isFirstRangeRef.current = false; return; }
        setData(seedFromCache(range, lang, filter));
    }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

    const refresh = useCallback(async (force = false, signal?: AbortSignal) => {
        const seq = ++requestSeqRef.current;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ range });
            if (lang) params.set('lang', lang);
            if (force) params.set('refresh', 'true');
            const url = `/api/market-data?${params.toString()}`;
            const response = await fetch(url, { signal });
            if (!response.ok) {
                if (seq !== requestSeqRef.current) return;
                setError(true);
                return;
            }
            const result: MarketDataResponse = await response.json();
            if (seq !== requestSeqRef.current) return;
            if (result.success) {
                setError(false);
                setData(filter ? result.data.filter(filter) : result.data);
            } else {
                setError(true);
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            if (seq !== requestSeqRef.current) return;
            setError(true);
            console.error('Failed to fetch market data:', err);
        } finally {
            if (seq === requestSeqRef.current && !signal?.aborted) setIsLoading(false);
        }
    }, [range, filter, lang]);

    useEffect(() => {
        const controller = new AbortController();
        refresh(false, controller.signal);
        if (refreshMs && refreshMs > 0) {
            const id = setInterval(() => { refresh(false, controller.signal); }, refreshMs);
            return () => {
                controller.abort();
                clearInterval(id);
            };
        }
        return () => controller.abort();
    }, [refresh, refreshMs]);

    return { data, isLoading, error, refresh };
}
