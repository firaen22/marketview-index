const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const API_URL = 'https://www.alphavantage.co/query';

// 使用 localStorage 的 key
const CACHE_KEY = 'market_flow_data_v1';

const INDICES_TO_FETCH = [
  { symbol: 'SPY', category: 'US', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', category: 'US', name: 'Nasdaq 100 ETF' },
  { symbol: 'GLD', category: 'Commodity', name: 'Gold ETF' },
];

export default async function handler(req: any, res: any) {
  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // 由於沒有 Vercel KV，我們只能直接去打 Alpha Vantage
    // 注意：這會直接消耗 25 次/日的配額
    const data = await fetchAllIndices();

    return res.status(200).json({
      success: true,
      source: 'live_api',
      data
    });
  } catch (error: any) {
    console.error('API Error:', error);

    return res.status(200).json({
      success: false,
      error: error.message,
      message: 'API Error or Limit Reached. Frontend will handle freeze.'
    });
  }
}

async function fetchAllIndices() {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error("ALPHA_VANTAGE_API_KEY is not configured in Vercel environment variables.");
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

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
