import { Redis } from '@upstash/redis'
import yahooFinance from 'yahoo-finance2';

const CACHE_KEY = 'global_market_cache_yfinance_v1';

// 檢查是否有配置 Upstash (從 Vercel 自動注入)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasUpstash = !!redisUrl && !!redisToken;

// 建立 Redis Client (若無配置則為 null)
const redis = hasUpstash
  ? new Redis({
    url: redisUrl!,
    token: redisToken!,
  })
  : null;

const INDICES_TO_FETCH = [
  { symbol: '^GSPC', category: 'US', name: 'S&P 500' },
  { symbol: '^IXIC', category: 'US', name: 'Nasdaq Composite' },
  { symbol: '^DJI', category: 'US', name: 'Dow Jones' },
  { symbol: '^VIX', category: 'Volatility', name: 'VIX' },
  { symbol: 'DX-Y.NYB', category: 'Currency', name: 'US Dollar Index' },
  { symbol: '^HSI', category: 'Asia', name: 'Hang Seng Index' },
  { symbol: '^N225', category: 'Asia', name: 'Nikkei 225' },
  { symbol: '^FTSE', category: 'Europe', name: 'FTSE 100' },
  { symbol: 'BTC-USD', category: 'Crypto', name: 'Bitcoin' },
  { symbol: 'ETH-USD', category: 'Crypto', name: 'Ethereum' },
  { symbol: 'CL=F', category: 'Commodity', name: 'Crude Oil' },
  { symbol: 'GC=F', category: 'Commodity', name: 'Gold' },
];

export default async function handler(req: any, res: any) {
  try {
    // 設置不快取 API Response，而是依賴 Redis
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const isCron = req.headers['user-agent']?.includes('Vercel-Cron');

    // 1. 嘗試從 Redis 讀取全球快取資料
    let cachedPayload: any = redis ? await redis.get(CACHE_KEY) : null;

    // 2. 如果是 Cron 時段 (早上 9 點)、強制更新、或 Redis 內完全沒資料，就拉取新資料並寫入 Redis
    if (isCron || forceRefresh || !cachedPayload) {
      console.log('Fetching fresh data from Yahoo Finance...');
      const freshData = await fetchAllIndices();

      const payload = {
        success: true,
        source: isCron ? 'cron_updated_cache' : (redis ? 'live_api_cached' : 'live_api_no_redis'),
        timestamp: new Date().toISOString(),
        data: freshData,
      };

      if (redis) {
        await redis.set(CACHE_KEY, JSON.stringify(payload));
      }
      return res.status(200).json(payload);
    }

    // 3. 一般前端請求，直接回傳 Redis 上的資料（節省 API 額度與防 IP Ban）
    const resultPayload = typeof cachedPayload === 'string' ? JSON.parse(cachedPayload) : cachedPayload;
    if (resultPayload) {
      resultPayload.source = 'server_cache';
    }

    return res.status(200).json(resultPayload);

  } catch (error: any) {
    console.error('API Error:', error);

    // 如果拉取失敗，但 Redis 裡面有舊資料，執行 Server-Side Freeze
    if (redis) {
      try {
        const fallbackPayload: any = await redis.get(CACHE_KEY);
        if (fallbackPayload) {
          const parsed = typeof fallbackPayload === 'string' ? JSON.parse(fallbackPayload) : fallbackPayload;
          return res.status(200).json({
            ...parsed,
            success: false,
            source: 'server_stale_cache',
            error: error.message,
            message: 'Yahoo Finance Fetch Error. Serving Server-Side Frozen Data.'
          });
        }
      } catch (e) {
        console.error('Failed to read fallback from redis:', e);
      }
    }

    return res.status(200).json({
      success: false,
      error: error.message,
      message: 'API Error and No Cache Available.'
    });
  }
}

async function fetchAllIndices() {
  const results = [];

  for (const index of INDICES_TO_FETCH) {
    try {
      const quoteString = index.symbol;
      const quote: any = await yahooFinance.quote(quoteString);

      if (quote) {
        const price = quote.regularMarketPrice || 0;
        const change = quote.regularMarketChange || 0;
        const changePercent = quote.regularMarketChangePercent || 0;
        const open = quote.regularMarketOpen || price;
        const high = quote.regularMarketDayHigh || price;
        const low = quote.regularMarketDayLow || price;

        results.push({
          symbol: index.symbol,
          name: index.name,
          category: index.category,
          price,
          change,
          changePercent,
          open,
          high,
          low,
          ytdChange: 0, // 可以另外算或忽略
          ytdChangePercent: 0,
          history: Array.from({ length: 20 }, (_, i) => ({ value: price + (Math.random() - 0.5) * (high - low || price * 0.01) })),
        });
      }
    } catch (err: any) {
      console.warn(`Failed to fetch ${index.symbol}:`, err.message);
    }

    // 稍微延遲避免瞬間併發太多被鎖
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (results.length === 0) {
    throw new Error('Failed to fetch any data from Yahoo Finance');
  }

  return results;
}
