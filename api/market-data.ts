import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { redis } from '../lib/redis.js';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const CACHE_KEY = 'global_market_cache_yfinance_v1';

// The record carry-forward falls back on once the hourly cache is gone. That
// hourly key was the ONLY thing carry-forward merged against, so a symbol that
// kept failing survived exactly one TTL: the key expires overnight, every
// night (nobody refreshes at 01:00), the 01:30 cron then fetches with nothing
// to carry from, and the morning presentation opened one tile short — no
// tile, so no Delayed badge either. This key holds the last complete payload
// for a week; the tile keeps its badge the whole time. A week, not forever:
// past that a "Delayed" badge understates the age too much to be honest.
export const LAST_GOOD_KEY = 'global_market_last_good_v1';
export const LAST_GOOD_TTL_SECONDS = 7 * 24 * 3600;

export function parseCachePayload(payload: any) {
  if (!payload) return null;
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function readLastGood(range: string) {
  if (!redis) return null;
  return parseCachePayload(await redis.get(`${LAST_GOOD_KEY}_${range}`));
}

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
    const parsedCache = parseCachePayload(cachedPayload);
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
      // Carry from the hourly cache first (freshest), then last_good, which
      // outlives it — see LAST_GOOD_KEY. Both are consulted rather than one
      // or the other: mergeCarriedForward takes the first match per symbol,
      // so the hourly row wins wherever both hold one. Read only on this
      // branch; the cached hot path below never pays the extra round-trip.
      const lastGood = await readLastGood(range);
      const carrySource = [
        ...(Array.isArray(parsedCache?.data) ? parsedCache.data : []),
        ...(Array.isArray(lastGood?.data) ? lastGood.data : []),
      ];
      const freshData = await fetchAllIndices(range, Boolean(parsedCache || lastGood));
      const mergedData = carrySource.length > 0
        ? mergeCarriedForward(freshData, carrySource)
        : freshData;

      const payload = {
        success: true,
        source: isCron ? 'cron_updated_cache' : (redis ? 'live_api_cached' : 'live_api_no_redis'),
        timestamp: new Date().toISOString(),
        data: mergedData,
      };

      const hasEstimatedData = mergedData.some((item: any) => item.estimated === true);
      // A symbol whose quote AND chart both failed is `continue`d, not marked
      // estimated, so an incomplete payload used to look clean to the check
      // above and get cached for an hour. That persists a HOLE: the tile is
      // absent, so it carries no Delayed badge either, and every request until
      // the TTL expires serves the gap. Only cache a payload that covers every
      // symbol — an incomplete one is still returned to this caller, just not
      // remembered.
      const isComplete = mergedData.length === INDICES_TO_FETCH.length;
      if (redis && !hasEstimatedData && isComplete) {
        // Cache expires in 1 hour
        await redis.set(RANGE_CACHE_KEY, JSON.stringify(payload), { ex: 3600 });
        await redis.set(`${LAST_GOOD_KEY}_${range}`, JSON.stringify(payload), { ex: LAST_GOOD_TTL_SECONDS });
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
        // Hourly cache first, then last_good: fetchAllIndices rethrows a
        // quote failure whenever EITHER exists (fast failover), so this catch
        // must be able to serve either or that rethrow lands on the
        // 'No Cache Available' branch below.
        const parsed: any = parseCachePayload(await redis.get(RANGE_CACHE_KEY)) ?? await readLastGood(range);
        if (parsed) {
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
  signal?: AbortSignal,
): Promise<Array<{ date: Date; close: number }>> {
  const timeslot = `${period1}T00:00:00Z-${period2}T23:59:59Z`;
  const url = 'https://tw.stock.yahoo.com/_td-stock/api/resource/FundServices.fundsPriceHistory'
    + `;fundId=${encodeURIComponent(fundId)};timeslot=${encodeURIComponent(timeslot)}`;
  try {
    // 5s, not 8s: quote() runs before this and the Yahoo Finance chart
    // fallback after it, so a stalled TW call at 8s pushed the whole refresh
    // against a 10s function budget (sweep 20). Live latency is ~1s.
    // A caller-supplied signal SHARES one budget with that chart fallback, so
    // the two cannot burn 5s each in sequence — see fetchAllIndices.
    const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(5000) });
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

/**
 * `hasFrozenFallback` says whether the caller holds a cached payload it can
 * serve if this throws. It decides what a batch-quote failure means:
 *
 * - WITH a fallback, rethrowing is the better outcome. The handler's catch
 *   serves `server_stale_cache` — real data, badged Delayed — and it does so
 *   at ~5s. Carrying on instead would spend another 5s on charts and push the
 *   request into Vercel's ~10s kill, and a killed function NEVER runs the
 *   catch, so the projector would get nothing at all rather than frozen data.
 * - WITHOUT one, there is nothing to fall back to, so chart-only is strictly
 *   better than the 'No Cache Available' blank screen: the `!quote` path below
 *   builds a full item from chart history, and `results.length === 0` still
 *   throws if even that fails.
 */
export async function fetchAllIndices(range: string, hasFrozenFallback = false) {
  const startedAt = Date.now();
  const symbols = INDICES_TO_FETCH.map(i => i.symbol);
  let quotes: any[] = [];
  try {
    quotes = await yahooFinance.quote(symbols, undefined, {
      fetchOptions: { signal: AbortSignal.timeout(5000) },
    });
  } catch (err: any) {
    if (hasFrozenFallback) throw err;
    console.warn('Yahoo Finance batch quote failed, building from charts only:', err?.message);
    quotes = [];
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
  // ONE deadline for the whole chart phase, not one per request. A twFundId
  // entry awaits Yahoo TW and only then its chart fallback, so per-request 5s
  // budgets let that single symbol spend 10s — on top of the 5s quote above,
  // ~15s against a function budget with no maxDuration set in vercel.json
  // (Vercel's default is ~10s). A killed function never runs the handler's
  // catch, so overrunning costs the frozen-cache fallback entirely. Sharing
  // one signal caps the phase however the fallbacks chain, and the remaining
  // budget accounts for the time quote() already spent.
  const chartBudgetMs = Math.max(1500, 8000 - (Date.now() - startedAt));
  const chartSignal = AbortSignal.timeout(chartBudgetMs);
  const rawHistories = await Promise.all(INDICES_TO_FETCH.map(async (index: any) => {
    if (index.twFundId) {
      const tw = await fetchYahooTwFundHistory(index.twFundId, period1, period2, interval, chartSignal);
      if (tw.length > 0) return { quotes: tw };
      console.warn(`Symbol ${index.symbol}: Yahoo TW history empty, falling back to Yahoo Finance chart`);
    }
    return yahooFinance.chart(index.symbol, { period1, period2, interval }, {
      fetchOptions: { signal: chartSignal },
    }).catch(() => ({ quotes: [] }));
  }));

  const results = [];
  for (let idx = 0; idx < INDICES_TO_FETCH.length; idx++) {
    const index = INDICES_TO_FETCH[idx] as any;
    const quote = quotes.find((q: any) => q.symbol === index.symbol);
    // A malformed date survives a close-only filter and then throws RangeError
    // at `new Date(pt.date).toISOString()` below — which escapes fetchAllIndices
    // and freezes the WHOLE payload, not just this symbol. Reject unparseable
    // dates the way fetchYahooTwFundHistory already does; an ABSENT date stays
    // allowed, since it is handled as "unknown" downstream.
    const chartData = (rawHistories[idx].quotes || []).filter((pt: any) => pt
      && Number.isFinite(pt.close) && pt.close > 0
      && (pt.date === undefined || pt.date === null || !Number.isNaN(new Date(pt.date).getTime())));
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
        // The quote's OHLC describes the quote's own (for funds, often
        // months-old) price, not the chart close just substituted for it —
        // prod served the gold fund at price 112.5 under High/Low 114.6 on
        // 2026-09-05, i.e. a price outside its own day range on the card.
        // A fund publishes one NAV per day, so the range collapses to it.
        open = price; high = price; low = price;
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
      // Badge EVERY estimated tile, not just funds. The ytdChange above is
      // synthesised from fiftyTwoWeekLow — it is not a real YTD — and the
      // sparkline is empty, yet no client reads `estimated`, so the invented
      // figure renders as fact. mergeCarriedForward only rescues this when a
      // cache row exists; with a cold cache the tile survives as-is, which is
      // exactly the stale-without-a-banner case. A fund's quote NAV may also
      // be months old. An index's price is still live, so `stale` slightly
      // over-states the problem here — the safe direction under the invariant.
      stale = true;
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

/**
 * A cached row is only worth carrying if it can actually render. `/` reaches
 * MarketStatCard through useDashboardData, which — unlike useMarketData —
 * applies no `usableQuotes` gate, and the card dereferences
 * `changePercent.toFixed`, `ytdChangePercent.toFixed` and
 * `low/high.toLocaleString()` unguarded. A cache row from an older deploy with
 * a different item shape would therefore throw during render and blank the
 * dashboard. Mirrors the field list in useMarketData.usableQuotes.
 */
function isRenderable(item: any) {
  return Number.isFinite(item?.price)
    && Number.isFinite(item?.changePercent)
    && Number.isFinite(item?.ytdChangePercent)
    && Number.isFinite(item?.low)
    && Number.isFinite(item?.high)
    && Array.isArray(item?.history);
}

export function mergeCarriedForward(fresh: any[], cachedData: any[]) {
  // An `estimated` item is the chart-failed fallback: empty history (blank
  // sparkline) and a ytdChange synthesised from fiftyTwoWeekLow, rendered by
  // the client with no cue at all. When the previous payload still holds real
  // data for that symbol it is strictly better, badged stale — so treat an
  // estimated item as absent and let the carry-forward below replace it.
  const freshSymbols = new Set(
    fresh.filter((item: any) => item?.estimated !== true).map((item: any) => item?.symbol),
  );
  const carried = INDICES_TO_FETCH
    .map(index => cachedData.find((item: any) => item && typeof item === 'object' && typeof item.symbol === 'string' && item.symbol === index.symbol))
    .filter((item: any) => item && !freshSymbols.has(item.symbol) && isRenderable(item))
    .map((item: any) => ({ ...item, stale: true }));

  if (carried.length === 0) return fresh;

  // Only drop an estimated item when something real actually replaced it;
  // with no cached entry the symbol still has to appear.
  const carriedSymbols = new Set(carried.map((item: any) => item.symbol));
  const kept = fresh.filter((item: any) => item?.estimated !== true || !carriedSymbols.has(item?.symbol));

  return [...kept, ...carried].sort((a: any, b: any) => (
    INDICES_TO_FETCH.findIndex(index => index.symbol === a.symbol)
    - INDICES_TO_FETCH.findIndex(index => index.symbol === b.symbol)
  ));
}
