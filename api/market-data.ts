import { Redis } from '@upstash/redis'

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const API_URL = 'https://www.alphavantage.co/query';
const CACHE_KEY = 'global_market_cache_v2';

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
  { symbol: 'SPY', category: 'US', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', category: 'US', name: 'Nasdaq 100 ETF' },
  { symbol: 'GLD', category: 'Commodity', name: 'Gold ETF' },
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

    // 如果 Redis 尚未設定，回退到原本的無快取模式
    if (!redis) {
      const data = await fetchAllIndices();
      return res.status(200).json({ success: true, source: 'live_api_no_redis', timestamp: new Date().toISOString(), data });
    }

    // 1. 嘗試從 Redis 讀取全球快取資料
    let cachedPayload: any = await redis.get(CACHE_KEY);

    // 2. 如果是 Cron 時段、強制更新、或 Redis 內完全沒資料，就拉取新資料並寫入 Redis
    if (isCron || forceRefresh || !cachedPayload) {
      console.log('Fetching fresh data from Alpha Vantage...');
      const freshData = await fetchAllIndices();

      const payload = {
        success: true,
        source: isCron ? 'cron_updated_cache' : 'live_api_cached',
        timestamp: new Date().toISOString(),
        data: freshData,
      };

      await redis.set(CACHE_KEY, JSON.stringify(payload));
      return res.status(200).json(payload);
    }

    // 3. 一般前端請求，直接回傳 Redis 上的資料（節省 API 額度）
    // Upstash Redis SDK 如果讀取 JSON字串 且傳入型別沒設定，有時會自動 parse 有時不會，這裡做個防呆
    const resultPayload = typeof cachedPayload === 'string' ? JSON.parse(cachedPayload) : cachedPayload;
    resultPayload.source = 'server_cache';

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
            message: 'Alpha Vantage Limit Reached. Serving Server-Side Frozen Data.'
          });
        }
      } catch (e) {
        console.error('Failed to read fallback from redis:', e);
      }
    }

    return res.status(200).json({
      success: false,
      error: error.message,
      isLimit: error.message.includes('Limit'),
      message: 'API Error and No Cache Available.'
    });
  }
}

async function fetchAllIndices() {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error("ALPHA_VANTAGE_API_KEY is not configured.");
  }

  const results = [];

  for (const index of INDICES_TO_FETCH) {
    const url = `${API_URL}?function=GLOBAL_QUOTE&symbol=${index.symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Information || data.Note) {
      throw new Error(`Alpha Vantage Limit: ${data.Information || data.Note}`);
    }

    const quote = data["Global Quote"];

    if (quote && quote["05. price"]) {
      const price = parseFloat(quote["05. price"]);
      const high = parseFloat(quote["03. high"]);
      const low = parseFloat(quote["04. low"]);

      results.push({
        symbol: index.symbol,
        name: index.name,
        category: index.category,
        price,
        change: parseFloat(quote["09. change"]),
        changePercent: parseFloat(quote["10. change percent"].replace('%', '')),
        open: parseFloat(quote["02. open"]),
        high,
        low,
        ytdChange: 0,
        ytdChangePercent: 0,
        history: Array.from({ length: 20 }, (_, i) => ({ value: price + (Math.random() - 0.5) * (high - low) })),
      });
    }

    await new Promise(resolve => setTimeout(resolve, 800));
  }

  return results;
}
