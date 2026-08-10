import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../lib/redis.js';

const CACHE_KEY = 'global_macro_data_v3';
const CACHE_TTL = 3600 * 24; // Cache for 24 hours, macro data updates monthly

const MACRO_SERIES = [
    { symbol: 'CPIAUCSL', name: '消費者物價指數 (CPI)', nameEn: 'Consumer Price Index (CPI)', category: 'Inflation' },
    { symbol: 'CPILFESL', name: '核心 CPI', nameEn: 'Core CPI', category: 'Inflation' },
    { symbol: 'PPIFIS', name: '生產者物價指數 (PPI)', nameEn: 'Producer Price Index (PPI)', category: 'Inflation' },
    { symbol: 'PPIFES', name: '核心 PPI', nameEn: 'Core PPI', category: 'Inflation' },
];

// Module-level so both the handler and its catch block's stale-cache fallback can use it.
const parseCache = (cached: any): any | null => {
    if (!cached) return null;
    if (typeof cached !== 'string') return cached;
    try {
        return JSON.parse(cached);
    } catch {
        return null;
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';
        const returnCachedPayload = (payload: any) => {
            return res.status(200).json({ ...payload, source: 'cache' });
        };

        let cached: any = redis ? await redis.get(CACHE_KEY) : null;
        const parsedCache = parseCache(cached);
        if (redis && forceRefresh) {
            const throttleKey = `refresh_throttle_${CACHE_KEY}`;
            // NX makes the check-and-arm atomic: two concurrent refreshes must
            // not both observe "no throttle" and double-fetch FRED (same
            // pattern as api/market-data.ts).
            const lock = await redis.set(throttleKey, '1', { ex: 60, nx: true });
            if (!lock && parsedCache) {
                return returnCachedPayload(parsedCache);
            }
            if (!lock) {
                return res.status(503).json({ success: false, error: 'Refresh already in progress' });
            }
        }

        if (redis && !forceRefresh) {
            if (parsedCache) {
                return returnCachedPayload(parsedCache);
            }
        }

        const apiKey = process.env.FRED_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'Missing FRED_API_KEY',
                message: 'Set FRED_API_KEY in the server environment.'
            });
        }

        console.log('Fetching fresh macro data from FRED...');

        const fetchGdp = async () => {
            try {
                // GDPC1 = Real GDP, quarterly, billions of chained 2017 dollars
                const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDPC1&api_key=${apiKey}&file_type=json&sort_order=desc&limit=6`;
                const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!response.ok) return null;
                const data = await response.json();
                if (!data.observations || data.observations.length < 5) return null;

                const current = parseFloat(data.observations[0].value);
                const prevQuarter = parseFloat(data.observations[1].value);
                const prevYear = parseFloat(data.observations[4].value);
                // Zero baselines (same contract as the monthly series below):
                // a 0 denominator would emit Infinity, which JSON-serializes
                // to null and reaches the client as a broken changePercent.
                if (isNaN(current) || isNaN(prevQuarter) || isNaN(prevYear) || prevQuarter === 0 || prevYear === 0) return null;

                const qoqChangePercent = ((current - prevQuarter) / prevQuarter) * 100;
                const yoyChangePercent = ((current - prevYear) / prevYear) * 100;

                return {
                    symbol: 'GDPC1',
                    name: '實質國內生產毛額 (GDP)',
                    nameEn: 'Real GDP',
                    value: current,
                    prevValue: prevQuarter,
                    change: current - prevYear,
                    changePercent: yoyChangePercent,
                    momChangePercent: qoqChangePercent,
                    changeLabel: 'YoY',
                    secondaryLabel: 'QoQ',
                    date: data.observations[0].date,
                    category: 'Growth',
                };
            } catch (e: any) {
                console.error('FRED fetch failed for GDPC1:', e.message);
                return null;
            }
        };

        const fetchGdpNow = async () => {
            try {
                const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDPNOW&api_key=${apiKey}&file_type=json&sort_order=desc&limit=2`;
                const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!response.ok) return null;
                const data = await response.json();
                if (!data.observations || data.observations.length < 2) return null;

                const current = parseFloat(data.observations[0].value);
                const prev = parseFloat(data.observations[1].value);
                if (isNaN(current) || isNaN(prev)) return null;

                const ppChange = current - prev;

                return {
                    symbol: 'GDPNOW',
                    name: 'GDPNow 即時預測',
                    nameEn: 'GDPNow Estimate',
                    value: current,
                    prevValue: prev,
                    change: ppChange,
                    changePercent: ppChange,
                    changeLabel: 'pp chg',
                    date: data.observations[0].date,
                    category: 'Growth',
                };
            } catch (e: any) {
                console.error('FRED fetch failed for GDPNOW:', e.message);
                return null;
            }
        };

        const settled = await Promise.all(MACRO_SERIES.map(async (series) => {
            try {
                const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.symbol}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=14`;
                const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`FRED API Error for ${series.symbol}: ${response.status} ${errText}`);
                    return null;
                }
                const data = await response.json();
                if (!data.observations || data.observations.length < 13) return null;

                const currentObs = data.observations[0];
                const currentValue = parseFloat(currentObs.value);
                const prevMonthValue = parseFloat(data.observations[1].value);
                const prevYearValue = parseFloat(data.observations[12].value);
                // FRED encodes missing observations as "." — drop the series when the
                // current or year-ago value is missing (same contract as fetchGdp).
                if (isNaN(currentValue) || isNaN(prevYearValue) || prevYearValue === 0) return null;

                const momChangePercent = isNaN(prevMonthValue) || prevMonthValue === 0
                    ? undefined
                    : ((currentValue - prevMonthValue) / prevMonthValue) * 100;
                const yoyChange = currentValue - prevYearValue;
                const yoyChangePercent = (yoyChange / prevYearValue) * 100;

                return {
                    symbol: series.symbol,
                    name: series.name,
                    nameEn: series.nameEn,
                    value: currentValue,
                    prevValue: isNaN(prevMonthValue) ? undefined : prevMonthValue,
                    change: yoyChange,
                    changePercent: yoyChangePercent,
                    momChangePercent: momChangePercent,
                    date: currentObs.date,
                    category: series.category
                };
            } catch (e: any) {
                console.error(`FRED fetch failed for ${series.symbol}:`, e.message);
                return null;
            }
        }));
        const [gdp, gdpNow] = await Promise.all([fetchGdp(), fetchGdpNow()]);
        const allFetched = [...settled, gdp, gdpNow];
        const results = allFetched.filter((r): r is NonNullable<typeof r> => r !== null);

        if (results.length === 0) {
            if (parsedCache) {
                return res.status(200).json({ ...parsedCache, source: 'server_stale_cache', stale: true });
            }
            return res.status(503).json({
                success: false,
                error: 'No valid macro data available',
            });
        }

        const payload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: results,
            source: 'live'
        };

        // A partial fetch (some FRED series failed) must not sit in the 24h
        // cache as if complete — a single flaky series would hide its tile for
        // a day. Cache only a full set; a partial response still serves live.
        if (redis && results.length === allFetched.length) {
            await redis.set(CACHE_KEY, JSON.stringify(payload), { ex: CACHE_TTL });
            console.log('Macro data cached in Redis.');
        }

        return res.status(200).json(payload);
    } catch (error: any) {
        console.error('Macro API Error:', error);
        // Attempt to serve stale cache if possible
        if (redis) {
            try {
                const stale = await redis.get(CACHE_KEY);
                const parsed = parseCache(stale);
                if (parsed) {
                    // Same shape as the results-empty stale path above: the data
                    // is valid (just stale), and useMacroData discards any
                    // payload with success: false — stamping failure here threw
                    // away the rescue on the client.
                    return res.status(200).json({ ...parsed, source: 'server_stale_cache', stale: true });
                }
            } catch (_) {
                // ignore fallback errors
            }
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch macroeconomic data',
            message: 'Failed to fetch macroeconomic data.'
        });
    }
}
