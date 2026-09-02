import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { redis } from '../lib/redis.js';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const CACHE_KEY = 'global_market_cache_yfinance_v1';

const INDICES_TO_FETCH = [
  { symbol: '^GSPC', category: 'US', subCategory: 'Large Cap', name: 'S&P 500' },
  { symbol: '^IXIC', category: 'US', subCategory: 'Tech', name: 'Nasdaq Composite' },
  { symbol: '^DJI', category: 'US', subCategory: 'Blue Chip', name: 'Dow Jones' },
  { symbol: '^VIX', category: 'Volatility', subCategory: 'Index', name: 'VIX' },
  { symbol: 'DX-Y.NYB', category: 'Currency', subCategory: 'Index', name: 'US Dollar Index' },
  { symbol: 'JPY=X', category: 'Currency', subCategory: 'Exchange Rate', name: 'USD/JPY' },
  { symbol: 'EURUSD=X', category: 'Currency', subCategory: 'Exchange Rate', name: 'EUR/USD' },
  { symbol: 'HKD=X', category: 'Currency', subCategory: 'Exchange Rate', name: 'USD/HKD' },
  { symbol: '^HSI', category: 'Asia', subCategory: 'Hong Kong', name: 'Hang Seng Index' },
  { symbol: '^N225', category: 'Asia', subCategory: 'Japan', name: 'Nikkei 225' },
  { symbol: '^BSESN', category: 'Asia', subCategory: 'India', name: 'BSE SENSEX' },
  { symbol: '^FTSE', category: 'Europe', subCategory: 'UK', name: 'FTSE 100' },
  { symbol: '^GDAXI', category: 'Europe', subCategory: 'Germany', name: 'DAX Performance' },
  { symbol: 'BTC-USD', category: 'Crypto', subCategory: 'Currency', name: 'Bitcoin' },
  { symbol: 'ETH-USD', category: 'Crypto', subCategory: 'Currency', name: 'Ethereum' },
  { symbol: 'CL=F', category: 'Commodity', subCategory: 'Energy', name: 'Crude Oil' },
  { symbol: 'GC=F', category: 'Commodity', subCategory: 'Metals', name: 'Gold' },
  {
    symbol: '0P00000EBQ',
    category: 'Fund',
    subCategory: 'Technology',
    name: '駿利亨德森遠見基金 - 環球科技領先基金',
    nameEn: 'Janus Henderson Horizon Fund - Global Technology Leaders Fund',
    // Yahoo Finance's series for this share class (A2 USD, LU0070992663)
    // stopped on 2026-07-17 and its quote endpoint dropped the symbol; Yahoo
    // Taiwan still publishes the daily NAV under this Morningstar id.
    twFundId: 'F0GBR04E8V:FO'
  },
  {
    symbol: '0P00001EVH',
    category: 'Fund',
    subCategory: 'India',
    name: '柏瑞環球基金 - 柏瑞印度股票基金"A"',
    nameEn: 'PineBridge Global Funds - PineBridge India Equity Fund "A"'
  },
  {
    symbol: '0P00000LV1',
    category: 'Fund',
    subCategory: 'Japan',
    name: 'JPM 日本股票（美元） - J股（分派）',
    nameEn: 'JPM Japan Equity J (dist) USD'
  },
  {
    symbol: '0P00010NVQ',
    category: 'Fund',
    subCategory: 'Europe',
    name: '摩根歐洲動力基金 A股（累計）- 美元避險',
    nameEn: 'JPM Europe Dynamic A (acc) USDH'
  },
  {
    symbol: '0P00000B5V.T',
    category: 'Fund',
    subCategory: 'Japan',
    name: '安本標準 - 日本可持續發展股票基金 A 累積 日圓',
    nameEn: 'abrdn SICAV I - Japanese Sustainable Equity Fund A Acc JPY'
  },
  {
    symbol: '0P000019NI',
    category: 'Fund',
    subCategory: 'US Core',
    name: '柏瑞環球基金 - 柏瑞美國研究加強核心股票基金 A',
    nameEn: 'PineBridge US Research Enhanced Core Equity Fund Class A'
  },
  {
    symbol: '0P00000B0I',
    category: 'Fund',
    subCategory: 'Commodity',
    name: '貝萊德世界黃金基金 A2',
    nameEn: 'BlackRock Global Funds - World Gold Fund A2'
  }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const forceRefresh = searchParams.get('refresh') === 'true';
  const requestedRange = searchParams.get('range') || 'YTD';
  const range = VALID_RANGES.includes(requestedRange) ? requestedRange : 'YTD';

  // Unique cache key per range
  const RANGE_CACHE_KEY = `${CACHE_KEY}_${range}`;

  try {
    // 設置不快取 API Response，而是依賴 Redis
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    const isCron = !!cronSecret && typeof authHeader === 'string' && authHeader === `Bearer ${cronSecret}`;

    // 1. 嘗試從 Redis 讀取全球快取資料
    let cachedPayload: any = redis ? await redis.get(RANGE_CACHE_KEY) : null;
    const parseCache = (payload: any) => {
      if (!payload) return null;
      if (typeof payload !== 'string') return payload;
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    };
    const parsedCache = parseCache(cachedPayload);
    const returnCachedPayload = (resultPayload: any) => {
      if (resultPayload) {
        resultPayload.source = 'server_cache';
      }

      return res.status(200).json(resultPayload);
    };

    if (redis && forceRefresh && !isCron) {
      const throttleKey = `refresh_throttle_${RANGE_CACHE_KEY}`;
      const lock = await redis.set(throttleKey, '1', { ex: 60, nx: true });
      if (!lock && parsedCache) {
        return returnCachedPayload(parsedCache);
      }
      if (!lock) {
        return res.status(503).json({ success: false, error: 'Refresh already in progress' });
      }
    }

    // 2. 如果是 Cron 時段 (早上 9 點)、強制更新、或 Redis 內完全沒資料，就拉取新資料並寫入 Redis
    if (isCron || forceRefresh || !parsedCache) {
      console.log(`Fetching fresh data for range ${range} from Yahoo Finance...`);
      const freshData = await fetchAllIndices(range);
      const mergedData = Array.isArray(parsedCache?.data)
        ? mergeCarriedForward(freshData, parsedCache.data)
        : freshData;

      const payload = {
        success: true,
        source: isCron ? 'cron_updated_cache' : (redis ? 'live_api_cached' : 'live_api_no_redis'),
        timestamp: new Date().toISOString(),
        data: mergedData,
      };

      const hasEstimatedData = mergedData.some((item: any) => item.estimated === true);
      if (redis && !hasEstimatedData) {
        // Cache expires in 1 hour
        await redis.set(RANGE_CACHE_KEY, JSON.stringify(payload), { ex: 3600 });
      }
      return res.status(200).json(payload);
    }

    // 3. 一般前端請求，直接回傳 Redis 上的資料（節省 API 額度與防 IP Ban）
    return returnCachedPayload(parsedCache);

  } catch (error: any) {
    console.error('API Error:', error);

    // 如果拉取失敗，但 Redis 裡面有舊資料，執行 Server-Side Freeze
    if (redis) {
      try {
        const fallbackPayload: any = await redis.get(RANGE_CACHE_KEY);
        if (fallbackPayload) {
          let parsed: any;
          try {
            parsed = typeof fallbackPayload === 'string' ? JSON.parse(fallbackPayload) : fallbackPayload;
          } catch {
            parsed = null;
          }
          if (!parsed) throw new Error('Invalid fallback cache payload');
          return res.status(200).json({
            ...parsed,
            success: false,
            source: 'server_stale_cache',
            error: 'Failed to fetch market data',
            message: 'Yahoo Finance Fetch Error. Serving Server-Side Frozen Data.'
          });
        }
      } catch (e) {
        console.error('Failed to read fallback from redis:', e);
      }
    }

    return res.status(200).json({
      success: false,
      error: 'Failed to fetch market data',
      message: 'API Error and No Cache Available.'
    });
  }
}

// Keep in sync with TimeRange (src/types/index.ts) and PresentRange (lib/presentCommand.ts).
export const VALID_RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];

// Newest real chart point older than this → item.stale. Weekly bars (5Y) are
// dated at the week's START (verified live 2026-09-02: ^GSPC/^HSI last bar =
// Mon 08-31 / Sun 08-30), so on a Monday before the new bar exists the newest
// point is already 7+ days old — weekly gets a 14-day budget.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_AFTER_WEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

// Yahoo Taiwan fund NAV history. Endpoint captured from tw.stock.yahoo.com's
// fund history page on 2026-09-02; it answers without cookies, a user agent,
// or the page's tracking params. Response: { closePrices: string[], dates: string[] }
// oldest-first, daily. Returns [] on any failure so the caller can fall back.
export async function fetchYahooTwFundHistory(
  fundId: string,
  period1: string,
  period2: string,
  interval: '1d' | '1wk',
): Promise<Array<{ date: Date; close: number }>> {
  const timeslot = `${period1}T00:00:00Z-${period2}T23:59:59Z`;
  const url = 'https://tw.stock.yahoo.com/_td-stock/api/resource/FundServices.fundsPriceHistory'
    + `;fundId=${encodeURIComponent(fundId)};timeslot=${encodeURIComponent(timeslot)}`;
  try {
    // 5s, not 8s: quote() runs before this and the Yahoo Finance chart
    // fallback after it, so a stalled TW call at 8s pushed the whole refresh
    // against a 10s function budget (sweep 20). Live latency is ~1s.
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const body: any = await response.json();
    const dates: unknown[] = Array.isArray(body?.dates) ? body.dates : [];
    const closes: unknown[] = Array.isArray(body?.closePrices) ? body.closePrices : [];
    const points: Array<{ date: Date; close: number }> = [];
    for (let i = 0; i < Math.min(dates.length, closes.length); i++) {
      const close = Number(closes[i]);
      const date = new Date(`${dates[i]}T00:00:00Z`);
      if (!Number.isFinite(close) || close <= 0 || Number.isNaN(date.getTime())) continue;
      points.push({ date, close });
    }
    if (interval === '1wk') {
      // Daily NAVs over 5Y are ~1250 points; keep one per week plus the last
      // point, matching the weekly bars the Yahoo Finance path returns.
      return points.filter((_, i) => i % 5 === 0 || i === points.length - 1);
    }
    return points;
  } catch (error) {
    console.warn(`Yahoo TW fund history failed for ${fundId}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function fetchAllIndices(range: string) {
  const symbols = INDICES_TO_FETCH.map(i => i.symbol);
  let quotes: any[] = [];
  try {
    quotes = await yahooFinance.quote(symbols, undefined, {
      fetchOptions: { signal: AbortSignal.timeout(5000) },
    });
  } catch (err: any) {
    throw new Error('Failed to fetch from Yahoo Finance in batch: ' + err.message);
  }

  // Calculate dynamic start date based on range
  const d1 = new Date();
  if (range === '1W') {
    d1.setDate(d1.getDate() - 7);
  } else if (range === '1M') {
    d1.setMonth(d1.getMonth() - 1);
  } else if (range === '3M') {
    d1.setMonth(d1.getMonth() - 3);
  } else if (range === '6M') {
    d1.setMonth(d1.getMonth() - 6);
  } else if (range === '1Y') {
    d1.setFullYear(d1.getFullYear() - 1);
  } else if (range === '5Y') {
    d1.setFullYear(d1.getFullYear() - 5);
  } else {
    // Default YTD
    d1.setFullYear(d1.getFullYear(), 0, 1);
  }
  const period1 = d1.toISOString().split('T')[0];
  const d2 = new Date();
  const period2 = d2.toISOString().split('T')[0];

  // Daily bars everywhere except 5Y, where ~1300 points per symbol would bloat
  // the cached payload for no visual gain at projector resolution.
  // 1W stays daily: mutual-fund symbols (0P…) only publish a daily NAV, so an
  // intraday interval would return an empty series for exactly the funds page.
  const interval = range === '5Y' ? '1wk' : '1d';

  // Fetch true dynamic history in parallel. Entries with a twFundId take
  // their NAV series from Yahoo Taiwan first and only fall back to Yahoo
  // Finance's chart when that fetch fails or comes back empty.
  const rawHistories = await Promise.all(INDICES_TO_FETCH.map(async (index: any) => {
    if (index.twFundId) {
      const tw = await fetchYahooTwFundHistory(index.twFundId, period1, period2, interval);
      if (tw.length > 0) return { quotes: tw };
      console.warn(`Symbol ${index.symbol}: Yahoo TW history empty, falling back to Yahoo Finance chart`);
    }
    return yahooFinance.chart(index.symbol, { period1, period2, interval }, {
      fetchOptions: { signal: AbortSignal.timeout(5000) },
    }).catch(() => ({ quotes: [] }));
  }));

  const results = [];
  for (let idx = 0; idx < INDICES_TO_FETCH.length; idx++) {
    const index = INDICES_TO_FETCH[idx] as any;
    const quote = quotes.find((q: any) => q.symbol === index.symbol);
    const chartData = (rawHistories[idx].quotes || []).filter((pt: any) => pt && Number.isFinite(pt.close) && pt.close > 0);
    // Yahoo's quote endpoint silently drops some mutual-fund symbols (0P00000EBQ
    // vanished from the batch on 2026-09-02) while its chart endpoint still
    // serves the full NAV history. Only skip when BOTH are empty; a chart-only
    // symbol is built from its last close below.
    if (!quote && chartData.length === 0) {
      console.warn(`Skipping symbol ${index.symbol}: no quote in batch response and no chart history`);
      continue;
    }
    if (!quote) {
      console.warn(`Symbol ${index.symbol}: quote missing from batch response, building from chart history`);
    }

    let price = quote?.regularMarketPrice || 0;
    let change = quote?.regularMarketChange || 0;
    let changePercent = quote?.regularMarketChangePercent || 0;
    let open = quote?.regularMarketOpen || price;
    let high = quote?.regularMarketDayHigh || price;
    let low = quote?.regularMarketDayLow || price;
    let history = [];
    let ytdChange = 0;
    let ytdChangePercent = 0;
    let estimated = false;
    let stale = false;

    if (chartData.length > 0) {
      // Use authentic history points
      history = chartData.map((pt: any) => ({
        value: pt.close,
        date: pt.date ? new Date(pt.date).toISOString() : new Date().toISOString()
      }));

      // Calculate change based on the authentic history span
      const firstClose = chartData[0].close;
      const lastClose = chartData[chartData.length - 1].close;
      // Guard the date like the history mapping does: a missing date must
      // not read as epoch 0 (= permanently stale).
      const newestPoint = chartData[chartData.length - 1];
      const newestDate = newestPoint.date ? new Date(newestPoint.date).getTime() : NaN;
      stale = Number.isFinite(newestDate)
        && Date.now() - newestDate > (interval === '1wk' ? STALE_AFTER_WEEKLY_MS : STALE_AFTER_MS);

      // FOR FUNDS: The quote API 'regularMarketPrice' is often stale by months. 
      // We overwrite it with the true latest chart close.
      // Also when the quote is present but priceless (regularMarketPrice
      // null/0): shipping price 0 next to a valid chart blanked the tile and
      // was cached for an hour (sweep 20).
      const priceless = !quote || !(price > 0);
      if ((index.category === 'Fund' || priceless) && lastClose > 0) {
        price = lastClose;
        if (priceless) { open = price; high = price; low = price; }
        if (chartData.length > 1) {
          const prevDayClose = chartData[chartData.length - 2].close;
          change = price - prevDayClose;
          changePercent = prevDayClose !== 0 ? (change / prevDayClose) * 100 : 0;
        } else {
          change = 0; changePercent = 0;
        }
      }

      // If the current price is available and looks reasonable, use it as the final point
      // Otherwise, the last historical close is the most reliable anchor
      const finalPrice = (price > 0 && Math.abs((price - lastClose) / lastClose) < 0.2) ? price : lastClose;

      ytdChange = finalPrice - firstClose;
      ytdChangePercent = firstClose !== 0 ? (ytdChange / firstClose) * 100 : 0;

      // Always end the graph on the current price for live effect
      history.push({ value: finalPrice, date: new Date().toISOString() });
    } else {
      // Fallback if Yahoo Chart API fails for a specific obscure ticker
      const fiftyTwoWeekLow = quote.fiftyTwoWeekLow || price * 0.9;
      if (price === 0 || !Number.isFinite(price)) {
        ytdChange = 0;
        ytdChangePercent = 0;
      } else {
        ytdChange = (price - fiftyTwoWeekLow) * 0.15;
        const denominator = price - ytdChange;
        ytdChangePercent = denominator !== 0 && Number.isFinite(denominator)
          ? (ytdChange / denominator) * 100
          : 0;
      }
      history = [];
      estimated = true;
    }

    results.push({
      symbol: index.symbol,
      name: index.name,
      nameEn: index.nameEn,
      category: index.category,
      subCategory: index.subCategory,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      ytdChange,
      ytdChangePercent,
      history,
      ...(estimated ? { estimated: true } : {}),
      ...(stale ? { stale: true } : {}),
    });
  }

  if (results.length === 0) {
    throw new Error('Failed to parse any data from Yahoo Finance quotes');
  }

  return results;
}

export function mergeCarriedForward(fresh: any[], cachedData: any[]) {
  const freshSymbols = new Set(fresh.map((item: any) => item?.symbol));
  const carried = INDICES_TO_FETCH
    .map(index => cachedData.find((item: any) => item && typeof item === 'object' && typeof item.symbol === 'string' && item.symbol === index.symbol))
    .filter((item: any) => item && !freshSymbols.has(item.symbol))
    .map((item: any) => ({ ...item, stale: true }));

  if (carried.length === 0) return fresh;

  return [...fresh, ...carried].sort((a: any, b: any) => (
    INDICES_TO_FETCH.findIndex(index => index.symbol === a.symbol)
    - INDICES_TO_FETCH.findIndex(index => index.symbol === b.symbol)
  ));
}
