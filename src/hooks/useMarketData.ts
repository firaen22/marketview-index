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

/**
 * How much to trust what `data` currently holds.
 *   live        — fetched fresh from the upstream provider this request
 *   cached      — served from the server's warm cache (normal steady state)
 *   stale       — the provider failed and the server returned FROZEN data
 *   unavailable — nothing usable arrived; `data` is whatever we already had
 */
export type DataMode = 'live' | 'cached' | 'stale' | 'unavailable';

interface Result {
    data: IndexData[];
    isLoading: boolean;
    /**
     * True whenever the response was not a fresh success. Deliberately NOT
     * derived from `dataMode` — FundsPage and HeatmapPage gate their error UI
     * on this, and re-pointing it at `unavailable` only would silently change
     * what those two pages render on a stale response. Use `dataMode` for nuance.
     *
     * Identical to the pre-freshness behaviour in every case except one: a
     * success whose every quote is non-finite now reports error (it previously
     * reported no error and rendered NaN% on the projector). An empty result —
     * including one emptied by the caller's `filter` — is still not an error.
     */
    error: boolean;
    dataMode: DataMode;
    /** Epoch ms the server says this data was generated, or null if unknown. */
    lastUpdatedAt: number | null;
    refresh: (force?: boolean) => Promise<void>;
}

/**
 * Drop entries that would render as NaN — or throw mid-render — on the
 * projector. A poisoned quote is worse than a missing one: `formatPrice(NaN)`
 * and `NaN%` are visible to clients, and a partial object is worse still —
 * MarketStatCard dereferences `history.length`, `ytdChangePercent.toFixed(2)`
 * and `low/high.toLocaleString()` unguarded, so a quote missing those fields
 * throws during render and blanks the page. Every field a renderer consumes
 * destructively is gated here. Elements are shape-checked first — the array can
 * contain nulls or primitives if the upstream payload is malformed.
 */
function usableQuotes(raw: unknown): IndexData[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is IndexData => {
        if (!item || typeof item !== 'object') return false;
        const q = item as Partial<IndexData>;
        return Number.isFinite(q.price)
            && Number.isFinite(q.changePercent)
            && Number.isFinite(q.ytdChangePercent)
            && Number.isFinite(q.low)
            && Number.isFinite(q.high)
            && Array.isArray(q.history);
    });
}

/** Success sources that mean the server actually reached the upstream provider. */
const FRESH_SOURCES: ReadonlySet<string> = new Set([
    'cron_updated_cache',
    'live_api_cached',
    'live_api_no_redis',
]);

function parseTimestamp(raw: unknown): number | null {
    if (typeof raw !== 'string') return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
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
            // Same NaN gate as fetched data: a corrupt localStorage entry must
            // not paint NaN% on the projector while the first fetch is in flight.
            const usable = usableQuotes(cached);
            if (usable.length > 0) return filter ? usable.filter(filter) : usable;
        }
    } catch {}
    return [];
}

export function useMarketData({ range, filter, lang, refreshMs }: Options): Result {
    const [data, setData] = useState<IndexData[]>(() => seedFromCache(range, lang, filter));
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    // Seeded-from-localStorage counts as cached until a fetch says otherwise.
    const [dataMode, setDataMode] = useState<DataMode>('cached');
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
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
        // The freshness state describes the OLD range's last response. Left
        // alone it outlives the data it described, so a "No live data" badge
        // from the previous range keeps showing while the new range is still
        // in flight. Reset to the same convention as the initial seed.
        setDataMode('cached');
        setLastUpdatedAt(null);
        // `error` describes the OLD range's response too. FundsPage/HeatmapPage
        // render their error row from it, so leaving it set flashes the previous
        // range's failure over the newly seeded data until the refetch lands.
        setError(false);
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
                setDataMode('unavailable');
                return;
            }
            const result: MarketDataResponse = await response.json();
            if (seq !== requestSeqRef.current) return;

            // Filtering runs before adoption so a payload of entirely poisoned
            // quotes is treated as no payload at all.
            const usable = usableQuotes(result?.data);
            const visible = filter ? usable.filter(filter) : usable;
            const timestamp = parseTimestamp(result?.timestamp);

            // Strict boolean: a malformed envelope (success: "false", 1, etc.)
            // must take the failure path, not clear the error flag and adopt.
            if (result?.success === true) {
                // Only a payload that ARRIVED non-empty and was then entirely
                // discarded as unusable counts as "no data" — that is a poisoned
                // feed, and holding the last good screen beats rendering NaN%.
                // Keyed on `usable`, never on `visible`: FundsPage filters to
                // category === 'Fund', so an empty *filtered* result is a normal
                // "no funds in this payload" answer and must adopt [] with
                // error=false exactly as it always did, not raise a banner.
                const arrived = Array.isArray(result.data) ? result.data.length : 0;
                if (arrived > 0 && usable.length === 0) {
                    setError(true);
                    setDataMode('unavailable');
                    return;
                }
                setError(false);
                // Whitelist, not blacklist: only these three success sources in
                // api/market-data.ts mean a fresh upstream fetch. 'server_cache' is
                // the warm-cache path, and an absent or unrecognised source is
                // reported as cached rather than overclaiming freshness — `source`
                // is untrusted JSON, so "not server_cache" does not imply live.
                setDataMode(FRESH_SOURCES.has(result.source as string) ? 'live' : 'cached');
                setData(visible);
                setLastUpdatedAt(timestamp);
                return;
            }

            // success:false still carries the server's frozen snapshot on the
            // server_stale_cache path (HTTP 200). Showing frozen-but-labelled data
            // beats showing nothing.
            setError(true);
            if (visible.length > 0) {
                setDataMode('stale');
                setData(visible);
                setLastUpdatedAt(timestamp);
            } else {
                setDataMode('unavailable');
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            if (seq !== requestSeqRef.current) return;
            setError(true);
            setDataMode('unavailable');
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

    return { data, isLoading, error, dataMode, lastUpdatedAt, refresh };
}
