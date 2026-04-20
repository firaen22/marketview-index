import { useCallback, useEffect, useState } from 'react';
import type { IndexData, MarketDataResponse } from '../types';

interface Options {
    range: string;
    filter?: (item: IndexData) => boolean;
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
export function useMarketData({ range, filter }: Options): Result {
    const [data, setData] = useState<IndexData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            const url = `/api/market-data?range=${range}${force ? '&refresh=true' : ''}`;
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
    }, [range, filter]);

    useEffect(() => { refresh(); }, [refresh]);

    return { data, isLoading, refresh };
}
