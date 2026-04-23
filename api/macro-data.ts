import { redis } from '../lib/redis.js';

const CACHE_KEY = 'global_macro_data_v3';
const CACHE_TTL = 3600 * 24; // Cache for 24 hours, macro data updates monthly

const MACRO_SERIES = [
    { symbol: 'CPIAUCSL', name: '消費者物價指數 (CPI)', nameEn: 'Consumer Price Index (CPI)', category: 'Inflation' },
    { symbol: 'CPILFESL', name: '核心 CPI', nameEn: 'Core CPI', category: 'Inflation' },
    { symbol: 'PPIFIS', name: '生產者物價指數 (PPI)', nameEn: 'Producer Price Index (PPI)', category: 'Inflation' },
    { symbol: 'PPIFES', name: '核心 PPI', nameEn: 'Core PPI', category: 'Inflation' },
];

export default async function handler(req: any, res: any) {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';

        const apiKey = process.env.FRED_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'Missing FRED_API_KEY',
                message: 'Set FRED_API_KEY in the server environment.'
            });
        }

        if (redis && !forceRefresh) {
            const cached: any = await redis.get(CACHE_KEY);
            if (cached) {
                const payload = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.status(200).json({ ...payload, source: 'cache' });
            }
        }

        console.log('Fetching fresh macro data from FRED...');

        const fetchGdp = async () => {
            try {
                // GDPC1 = Real GDP, quarterly, billions of chained 2017 dollars
                const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDPC1&api_key=${apiKey}&file_type=json&sort_order=desc&limit=6`;
                const response = await fetch(url);
                if (!response.ok) return null;
                const data = await response.json();
                if (!data.observations || data.observations.length < 5) return null;

                const current = parseFloat(data.observations[0].value);
                const prevQuarter = parseFloat(data.observations[1].value);
                const prevYear = parseFloat(data.observations[4].value);
                if (isNaN(current) || isNaN(prevQuarter) || isNaN(prevYear)) return null;

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
                const response = await fetch(url);
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
                const response = await fetch(url);
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

                const momChange = currentValue - prevMonthValue;
                const momChangePercent = (momChange / prevMonthValue) * 100;
                const yoyChange = currentValue - prevYearValue;
                const yoyChangePercent = (yoyChange / prevYearValue) * 100;

                return {
                    symbol: series.symbol,
                    name: series.name,
                    nameEn: series.nameEn,
                    value: currentValue,
                    prevValue: prevMonthValue,
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

        const payload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: results,
            source: 'live'
        };

        if (redis) {
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
