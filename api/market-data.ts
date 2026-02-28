const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const API_URL = 'https://www.alphavantage.co/query';

// 本地存儲配額狀態的 Key (雖然 Vercel KV 沒了，但在 Server 內我們可以用一個模擬機制或環境變數控管)
// 由於 Vercel Serverless 無法持久化狀態，我們依賴前端記錄或從 Alpha Vantage Header/Error 判斷
// 這裡我們在 API 回傳中帶上配額估計（假設每日 25 次）

const INDICES_TO_FETCH = [
  { symbol: 'SPY', category: 'US', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', category: 'US', name: 'Nasdaq 100 ETF' },
  { symbol: 'GLD', category: 'Commodity', name: 'Gold ETF' },
];

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const data = await fetchAllIndices();

    return res.status(200).json({
      success: true,
      source: 'live_api',
      timestamp: new Date().toISOString(),
      data
    });
  } catch (error: any) {
    console.error('API Error:', error);

    return res.status(200).json({
      success: false,
      error: error.message,
      isLimit: error.message.includes('Limit'),
      message: 'API Error or Limit Reached.'
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
      // 這裡丟出 Error，前端會捕捉並顯示剩餘 0
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
