import { useCallback, useEffect, useRef, useState } from 'react';
import type { MacroData, MacroDataResponse } from '../types';

interface Options {
    lang?: 'en' | 'zh-TW';
    refreshMs?: number;
}

interface Result {
    data: MacroData[];
    isLoading: boolean;
    refresh: (force?: boolean) => Promise<void>;
}

export function useMacroData({ lang, refreshMs }: Options): Result {
    const [data, setData] = useState<MacroData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // Latest request wins: a slow earlier response must not overwrite newer data.
    const requestSeqRef = useRef(0);

    const refresh = useCallback(async (force = false, signal?: AbortSignal) => {
        const seq = ++requestSeqRef.current;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (lang) params.set('lang', lang);
            if (force) params.set('refresh', 'true');

            const url = `/api/macro-data?${params.toString()}`;
            const response = await fetch(url, { signal });
            if (!response.ok) return;
            const result: MacroDataResponse = await response.json();

            if (seq === requestSeqRef.current && result.success) {
                setData(result.data);
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            console.error('Failed to fetch macro data:', err);
        } finally {
            if (seq === requestSeqRef.current && !signal?.aborted) setIsLoading(false);
        }
    }, [lang]);

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

    return { data, isLoading, refresh };
}
