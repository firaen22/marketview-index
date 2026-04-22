import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasUpstash = !!redisUrl && !!redisToken && String(redisUrl).startsWith('https://');
let redis: Redis | null = null;
if (hasUpstash) {
    try { redis = new Redis({ url: redisUrl!, token: redisToken! }); } catch (e) { console.error('Redis init error:', e); }
}

const CACHE_KEY = 'global_macro_data_v1';
const CACHE_TTL = 3600 * 24; // Cache for 24 hours, macro data updates monthly

const MACRO_SERIES = [
    { symbol: 'CPIAUCSL', name: '消費者物價指數 (CPI)', nameEn: 'Consumer Price Index (CPI)', category: 'Inflation' },
    { symbol: 'CPILFESL', name: '核心 CPI', nameEn: 'Core CPI', category: 'Inflation' },
    { symbol: 'PPIACO', name: '生產者物價指數 (PPI)', nameEn: 'Producer Price Index (PPI)', category: 'Inflation' },
    { symbol: 'PPIFIS', name: '核心 PPI', nameEn: 'Core PPI', category: 'Inflation' },
];

export default async function handler(req: any, res: any) {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';

        // Custom API Key support
        const authHeader = req.headers.authorization;
        const customApiKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const apiKey = customApiKey || process.env.FRED_API_KEY;

        if (!apiKey || apiKey === 'null' || apiKey === 'undefined') {
            return res.status(401).json({
                success: false,
                error: 'Missing FRED API Key',
                message: 'FRED API Key is required to fetch macroeconomic data. Please add it to your settings.'
            });
        }

        if (redis && !forceRefresh && !customApiKey) {
            const cached: any = await redis.get(CACHE_KEY);
            if (cached) {
                const payload = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.status(200).json({ ...payload, source: 'cache' });
            }
        }

        console.log('Fetching fresh macro data from FRED...');
        const results = [];

        for (const series of MACRO_SERIES) {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.symbol}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=14`;
            
            const response = await fetch(url);
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`FRED API Error for ${series.symbol}: ${response.status} ${errText}`);
            }

            const data = await response.json();
            
            if (data.observations && data.observations.length >= 13) {
                // Get most recent observation
                const currentObs = data.observations[0];
                const currentValue = parseFloat(currentObs.value);
                const currentDate = currentObs.date;
                
                // Get previous month (1 month ago) for MoM
                const prevMonthObs = data.observations[1];
                const prevMonthValue = parseFloat(prevMonthObs.value);
                
                // Get previous year (12 months ago) for YoY
                const prevYearObs = data.observations[12];
                const prevYearValue = parseFloat(prevYearObs.value);

                // MoM Change
                const momChange = currentValue - prevMonthValue;
                const momChangePercent = (momChange / prevMonthValue) * 100;
                
                // YoY Change
                const yoyChange = currentValue - prevYearValue;
                const yoyChangePercent = (yoyChange / prevYearValue) * 100;

                results.push({
                    symbol: series.symbol,
                    name: series.name,
                    nameEn: series.nameEn,
                    value: currentValue,
                    prevValue: prevMonthValue, // Used as baseline for typical charts
                    change: yoyChange,
                    changePercent: yoyChangePercent, // Primary change shown is typically YoY for CPI
                    momChangePercent: momChangePercent,
                    date: currentDate,
                    category: series.category
                });
            }
        }

        const payload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: results,
            source: 'live'
        };

        if (redis && !customApiKey) {
            await redis.set(CACHE_KEY, JSON.stringify(payload), { ex: CACHE_TTL });
            console.log('Macro data cached in Redis.');
        }

        return res.status(200).json(payload);
    } catch (error: any) {
        console.error('Macro API Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to fetch macroeconomic data.'
        });
    }
}
