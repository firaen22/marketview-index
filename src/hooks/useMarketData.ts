import { useCallback, useEffect, useState } from 'react';
import type { IndexData, MarketDataResponse } from '../types';

interface Options {
    range: string;
    filter?: (item: IndexData) => boolean;
    lang?: 'en' | 'zh-TW';
    refreshMs?: number;
}

interface Result {
    data: IndexData[];
    isLoading: boolean;
    refresh: (force?: boolean) => Promise<void>;
}

/**
 * Simple market-data fetcher for pages that don't need Dashboard's
 * cache + fallback + i18n error messaging (i.e. FundsPage, HeatmapPage).
 *
 * For the full-featured version (localStorage cache, stale-cache detection,
 * background polling, bilingual error messages) see Dashboard.tsx.
 */
export function useMarketData({ range, filter, lang, refreshMs }: Options): Result {
    const [data, setData] = useState<IndexData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ range });
            if (lang) params.set('lang', lang);
            if (force) params.set('refresh', 'true');
            const url = `/api/market-data?${params.toString()}`;
            const response = await fetch(url);
            const result: MarketDataResponse = await response.json();
            if (result.success) {
                setData(filter ? result.data.filter(filter) : result.data);
            }
        } catch (err) {
            console.error('Failed to fetch market data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [range, filter, lang]);

    useEffect(() => {
        refresh();
        if (refreshMs && refreshMs > 0) {
            const id = setInterval(() => { refresh(); }, refreshMs);
            return () => clearInterval(id);
        }
    }, [refresh, refreshMs]);

    return { data, isLoading, refresh };
}
