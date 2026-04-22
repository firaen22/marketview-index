import { useCallback, useEffect, useState } from 'react';
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

    const refresh = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (lang) params.set('lang', lang);
            if (force) params.set('refresh', 'true');

            const url = `/api/macro-data?${params.toString()}`;
            const response = await fetch(url);
            const result: MacroDataResponse = await response.json();
            
            if (result.success) {
                setData(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch macro data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [lang]);

    useEffect(() => {
        refresh();
        if (refreshMs && refreshMs > 0) {
            const id = setInterval(() => { refresh(); }, refreshMs);
            return () => clearInterval(id);
        }
    }, [refresh, refreshMs]);

    return { data, isLoading, refresh };
}
