/**
 * Financial Dashboard Component
 * 
 * Installation:
 * npm install lucide-react recharts clsx tailwind-merge
 * 
 * Ensure Tailwind CSS is configured.
 */
import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Clock, ExternalLink, RefreshCcw, LayoutDashboard, Columns, Loader2, AlertCircle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Mock Data ---
interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  ytdChange: number;
  ytdChangePercent: number;
  open: number;
  high: number;
  low: number;
  history: { value: number }[];
  category: 'US' | 'Europe' | 'Asia' | 'Commodity' | 'Crypto' | 'Currency' | 'Volatility';
}

interface NewsItem {
  id: string;
  source: string;
  time: string;
  title: string;
  summary: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  sentimentScore: number;
  url: string;
}

const MOCK_INDICES: IndexData[] = [
  {
    symbol: "^GSPC",
    name: "S&P 500",
    price: 5245.12,
    change: 23.45,
    changePercent: 0.45,
    ytdChange: 475.12,
    ytdChangePercent: 9.96,
    open: 5221.67,
    high: 5250.33,
    low: 5215.10,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 5200 + Math.random() * 60 + i * 2 })),
    category: 'US'
  },
  {
    symbol: "^IXIC",
    name: "Nasdaq",
    price: 16420.88,
    change: -45.20,
    changePercent: -0.27,
    ytdChange: 1420.88,
    ytdChangePercent: 9.47,
    open: 16466.08,
    high: 16500.12,
    low: 16380.55,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 16450 + Math.random() * 100 - i * 3 })),
    category: 'US'
  },
  {
    symbol: "^VIX",
    name: "Volatility Index",
    price: 13.20,
    change: -0.50,
    changePercent: -3.65,
    ytdChange: 0.75,
    ytdChangePercent: 6.02,
    open: 13.70,
    high: 13.90,
    low: 13.10,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 14 + Math.random() * 2 - i * 0.05 })),
    category: 'Volatility'
  },
  {
    symbol: "DXY",
    name: "US Dollar Index",
    price: 104.30,
    change: 0.25,
    changePercent: 0.24,
    ytdChange: 2.97,
    ytdChangePercent: 2.93,
    open: 104.05,
    high: 104.45,
    low: 103.95,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 103.5 + Math.random() * 1 + i * 0.05 })),
    category: 'Currency'
  },
  {
    symbol: "USD/JPY",
    name: "USD/JPY",
    price: 151.45,
    change: 0.35,
    changePercent: 0.23,
    ytdChange: 10.25,
    ytdChangePercent: 7.26,
    open: 151.10,
    high: 151.60,
    low: 150.90,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 150 + Math.random() * 2 + i * 0.1 })),
    category: 'Currency'
  },
  {
    symbol: "XAU/USD",
    name: "Gold",
    price: 2178.50,
    change: 12.30,
    changePercent: 0.57,
    ytdChange: 115.50,
    ytdChangePercent: 5.60,
    open: 2166.20,
    high: 2180.10,
    low: 2160.50,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 2150 + Math.random() * 30 + i })),
    category: 'Commodity'
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    price: 70150.00,
    change: 1200.00,
    changePercent: 1.74,
    ytdChange: 27900.00,
    ytdChangePercent: 66.04,
    open: 68950.00,
    high: 70500.00,
    low: 68500.00,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 68000 + Math.random() * 3000 + i * 100 })),
    category: 'Crypto'
  },
  {
    symbol: "^N225",
    name: "Nikkei 225",
    price: 40150.20,
    change: 350.60,
    changePercent: 0.88,
    ytdChange: 6150.20,
    ytdChangePercent: 18.09,
    open: 39800.60,
    high: 40200.10,
    low: 39750.40,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 39800 + Math.random() * 400 + i * 5 })),
    category: 'Asia'
  },
  {
    symbol: "^HSI",
    name: "Hang Seng",
    price: 16720.40,
    change: -120.10,
    changePercent: -0.71,
    ytdChange: -320.40,
    ytdChangePercent: -1.88,
    open: 16840.50,
    high: 16850.20,
    low: 16680.90,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 16800 - Math.random() * 100 - i * 4 })),
    category: 'Asia'
  },
  {
    symbol: "^GDAXI",
    name: "DAX",
    price: 18250.40,
    change: 80.50,
    changePercent: 0.44,
    ytdChange: 1500.40,
    ytdChangePercent: 8.96,
    open: 18180.20,
    high: 18280.50,
    low: 18150.10,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 18100 + Math.random() * 100 + i * 2 })),
    category: 'Europe'
  },
  {
    symbol: "XAG/USD",
    name: "Silver",
    price: 24.85,
    change: -0.15,
    changePercent: -0.60,
    ytdChange: 1.05,
    ytdChangePercent: 4.41,
    open: 25.00,
    high: 25.10,
    low: 24.70,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 24.5 + Math.random() * 1 })),
    category: 'Commodity'
  },
  {
    symbol: "HG=F",
    name: "Copper",
    price: 4.02,
    change: 0.03,
    changePercent: 0.75,
    ytdChange: 0.13,
    ytdChangePercent: 3.34,
    open: 3.99,
    high: 4.05,
    low: 3.98,
    history: Array.from({ length: 20 }, (_, i) => ({ value: 3.9 + Math.random() * 0.2 })),
    category: 'Commodity'
  }
];
const MOCK_NEWS: NewsItem[] = [
  {
    id: "1",
    source: "Bloomberg",
    time: "5m ago",
    title: "Fed Signals Rate Cuts May Come Sooner Than Expected",
    summary: "Federal Reserve officials indicated that inflation data has been encouraging, potentially opening the door for rate cuts in the next quarter.",
    sentiment: "Bullish",
    sentimentScore: 0.75,
    url: "#"
  },
  {
    id: "2",
    source: "Reuters",
    time: "12m ago",
    title: "Tech Giants Face New Antitrust Scrutiny in EU",
    summary: "European regulators are preparing a new wave of investigations into major tech companies over alleged anti-competitive practices.",
    sentiment: "Bearish",
    sentimentScore: -0.60,
    url: "#"
  },
  {
    id: "3",
    source: "CNBC",
    time: "30m ago",
    title: "Oil Prices Stabilize Amidst Geopolitical Tensions",
    summary: "Crude oil futures held steady as traders weighed supply risks against demand concerns in the global market.",
    sentiment: "Neutral",
    sentimentScore: 0.10,
    url: "#"
  },
  {
    id: "4",
    source: "Financial Times",
    time: "45m ago",
    title: "Asian Markets Rally on Strong Manufacturing Data",
    summary: "Key indices in Asia surged following reports of better-than-expected manufacturing output in the region's largest economies.",
    sentiment: "Bullish",
    sentimentScore: 0.65,
    url: "#"
  },
  {
    id: "5",
    source: "WSJ",
    time: "1h ago",
    title: "Retail Sales Dip Unexpectedly in February",
    summary: "Consumer spending cooled more than anticipated last month, raising questions about the resilience of the economic recovery.",
    sentiment: "Bearish",
    sentimentScore: -0.45,
    url: "#"
  },
  {
    id: "6",
    source: "MarketWatch",
    time: "1h 15m ago",
    title: "Crypto Volatility Continues as Bitcoin Tests New Highs",
    summary: "Digital assets remain volatile with Bitcoin fluctuating near its all-time high, driven by ETF inflows and halving anticipation.",
    sentiment: "Neutral",
    sentimentScore: 0.20,
    url: "#"
  },
  {
    id: "7",
    source: "Bloomberg",
    time: "2h ago",
    title: "Semiconductor Stocks Surge on AI Demand",
    summary: "Chipmakers are seeing record gains as the demand for AI-capable hardware continues to outstrip supply.",
    sentiment: "Bullish",
    sentimentScore: 0.85,
    url: "#"
  }
];

// --- UI Components (Mocking shadcn/ui) ---

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-100 shadow-sm", className)}
    {...props}
  />
));
Card.displayName = "Card";

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'bullish' | 'bearish' | 'neutral' }>(({ className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80",
    bullish: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25",
    bearish: "bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25",
    neutral: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/25",
  };
  return (
    <div
      ref={ref}
      className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2", variants[variant], className)}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-auto", className)}
    {...props}
  >
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";

// --- Sub-Components ---

const TickerItem: React.FC<{ item: IndexData }> = ({ item }) => {
  const isPositive = item.change >= 0;
  return (
    <div className="flex items-center space-x-4 px-6 py-2 border-r border-zinc-800 whitespace-nowrap">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-zinc-400">{item.symbol}</span>
        <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-sm font-mono font-medium text-zinc-100">{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <div className={cn("flex items-center text-xs font-mono", isPositive ? "text-emerald-400" : "text-rose-400")}>
          {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
          <span>{isPositive ? '+' : ''}{item.change.toFixed(2)} ({isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%)</span>
        </div>
      </div>
    </div>
  );
};

const NewsCard: React.FC<{ item: NewsItem }> = ({ item }) => {
  const sentimentVariant = item.sentiment.toLowerCase() as 'bullish' | 'bearish' | 'neutral';

  return (
    <Card className="mb-4 p-4 hover:bg-zinc-900 transition-colors cursor-pointer group border-zinc-800/60">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-400">{item.source}</span>
          <span>•</span>
          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{item.time}</span>
        </div>
        <Badge variant={sentimentVariant}>{item.sentiment}</Badge>
      </div>
      <h3 className="text-lg font-bold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors leading-tight">
        {item.title}
      </h3>
      <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
        {item.summary}
      </p>
    </Card>
  );
};

const MarketStatCard: React.FC<{ item: IndexData; chartHeight?: string }> = ({ item, chartHeight = "h-16" }) => {
  const isPositive = item.change >= 0;
  const isYtdPositive = item.ytdChange >= 0;

  return (
    <Card className="p-4 flex flex-col justify-between h-full border-zinc-800/60">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-bold text-zinc-100">{item.name}</h4>
          <span className="text-xs text-zinc-500">{item.symbol}</span>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-mono font-bold", isPositive ? "text-emerald-400" : "text-rose-400")}>
            {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={cn("text-xs font-mono flex items-center justify-end", isPositive ? "text-emerald-400" : "text-rose-400")}>
            1D: {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className={cn("w-full mb-4", chartHeight)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={item.history}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#34d399" : "#fb7185"}
              strokeWidth={2}
              dot={false}
            />
            <YAxis domain={['dataMin', 'dataMax']} hide />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs border-t border-zinc-800 pt-3">
        <div>
          <div className="text-zinc-500 mb-1">YTD Change</div>
          <div className={cn("font-mono font-medium", isYtdPositive ? "text-emerald-400" : "text-rose-400")}>
            {isYtdPositive ? '+' : ''}{item.ytdChangePercent.toFixed(2)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-zinc-500 mb-1">Range</div>
          <div className="font-mono text-zinc-300">
            {item.low.toLocaleString(undefined, { maximumFractionDigits: 0 })} - {item.high.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </Card>
  );
};

// --- Main Dashboard Component ---

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [marketData, setMarketData] = useState<IndexData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number>(25);

  const fetchMarketData = async () => {
    // 雖然伺服器有 Redis 快取了，但前端還是留著 localStorage 當作最後防線與計算每日配額 UI
    const CACHE_KEY = 'marketflow_cache';
    const QUOTA_KEY = `marketflow_quota_${new Date().toISOString().split('T')[0]}`;

    // 初始化或讀取今日剩餘配額
    const savedQuota = localStorage.getItem(QUOTA_KEY);
    let currentQuota = savedQuota ? parseInt(savedQuota) : 25;
    setRemainingQuota(currentQuota);

    setIsLoading(true);
    setIsError(false);
    setFallbackMessage(null);
    try {
      const response = await fetch(`/api/market-data?t=${new Date().getTime()}`);
      const result = await response.json();

      // 無論狀態為何，只要有 data 就先塞進 UI
      if (result.data && Array.isArray(result.data)) {
        setMarketData(result.data);

        // 成功取得新資料 (非從伺服器快取拿)，才扣減前端的配額計數UI
        if (result.success && result.source !== 'server_cache' && result.source !== 'server_stale_cache') {
          const newQuota = Math.max(0, currentQuota - 3);
          setRemainingQuota(newQuota);
          localStorage.setItem(QUOTA_KEY, newQuota.toString());
        }

        // 伺服器發現 API 滿了，傳回凍結的舊資料
        if (!result.success || result.source === 'server_stale_cache') {
          const timeStr = new Date(result.timestamp).toLocaleTimeString();
          setFallbackMessage(`API 額度已滿，顯示後端最後更新時間：${timeStr} (全局資料已凍結)`);
          setRemainingQuota(0);
          localStorage.setItem(QUOTA_KEY, "0");
        } else {
          // 正常狀態下，將後端傳來的最新資料也備份一份到前端 localStorage 作為最底層防線
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: new Date().getTime(),
            data: result.data
          }));
        }

      } else {
        throw new Error(result.error || "Failed to fetch data");
      }
    } catch (err: any) {
      console.error('Failed to fetch market data, attempting local frontend recovery:', err);
      // Backend 連續出錯或沒連上，退回前端 localstorage
      handleFallback(CACHE_KEY, `伺服器連線失敗。目前顯示裝置本地快取數據。`);

      if (err.message?.includes('Limit')) {
        setRemainingQuota(0);
        localStorage.setItem(QUOTA_KEY, "0");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFallback = (cacheKey: string, message: string) => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        const timeStr = new Date(timestamp).toLocaleTimeString();
        setMarketData(data);
        setFallbackMessage(`${message} (最後更新時間：${timeStr})`);
      } catch (e) {
        setIsError(true);
        setMarketData(MOCK_INDICES);
        setFallbackMessage('快取數據損壞，目前為模擬資料。');
      }
    } else {
      setIsError(true);
      setMarketData(MOCK_INDICES);
      setFallbackMessage('初次載入或無快取，API 配額可能已滿，目前顯示模擬資料。');
    }
  }

  useEffect(() => {
    fetchMarketData();
  }, []);

  const categories = ['All', ...Array.from(new Set(marketData.map(item => item.category)))];

  const filteredIndices = selectedCategory === 'All'
    ? marketData
    : marketData.filter(item => item.category === selectedCategory);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Header / Ticker */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Market<span className="text-blue-500">Flow</span></span>
          </div>
          <div className="flex items-center space-x-4 text-sm text-zinc-400">
            <div className="hidden sm:flex items-center space-x-3 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Daily API Quota</span>
              <div className="flex items-center">
                <div className={cn("w-2 h-2 rounded-full mr-2", remainingQuota > 10 ? "bg-emerald-500" : remainingQuota > 0 ? "bg-yellow-500" : "bg-rose-500 animate-pulse")} />
                <span className={cn("font-mono font-bold", remainingQuota > 0 ? "text-zinc-200" : "text-rose-400")}>{remainingQuota}</span>
                <span className="text-zinc-600 mx-1">/</span>
                <span className="text-zinc-500 font-mono">25</span>
              </div>
            </div>
            <span className="flex items-center font-mono">
              <Clock className="w-4 h-4 mr-2" />
              {currentTime.toLocaleTimeString()}
            </span>
            <button
              onClick={() => setIsPresentationMode(!isPresentationMode)}
              className={cn("p-2 rounded-full transition-colors flex items-center space-x-2", isPresentationMode ? "bg-blue-600 text-white hover:bg-blue-700" : "hover:bg-zinc-900")}
              title={isPresentationMode ? "Exit Presentation Mode" : "Enter Presentation Mode"}
            >
              {isPresentationMode ? <LayoutDashboard className="w-4 h-4" /> : <Columns className="w-4 h-4" />}
              <span className="hidden md:inline text-xs font-medium">{isPresentationMode ? "Dashboard" : "Presentation"}</span>
            </button>
            <button
              onClick={() => fetchMarketData()}
              className={cn("p-2 hover:bg-zinc-900 rounded-full transition-colors", isLoading && "animate-spin")}
              disabled={isLoading || remainingQuota <= 0}
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ticker Tape */}
        <div className="overflow-hidden whitespace-nowrap border-b border-zinc-800 bg-zinc-950 flex items-center h-12">
          {isLoading ? (
            <div className="w-full flex items-center justify-center text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading tickers...
            </div>
          ) : isError && marketData.length === 0 ? (
            <div className="w-full flex items-center justify-center text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 mr-2" /> Market data unavailable.
            </div>
          ) : (
            <div className="inline-flex animate-ticker">
              {marketData.map((index) => (
                <TickerItem key={index.symbol} item={index} />
              ))}
              {/* Duplicate for seamless loop effect if animated */}
              {marketData.map((index) => (
                <TickerItem key={`${index.symbol}-dup`} item={index} />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4 lg:p-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 transition-all duration-500 ease-in-out">

          {/* Left Column: Core Market News */}
          {!isPresentationMode && (
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-[calc(100vh-180px)] animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center">
                  <span className="w-1 h-6 bg-blue-500 mr-3 rounded-full"></span>
                  Core Market News
                </h2>
                <Badge variant="default" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Live Feed</Badge>
              </div>

              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-1">
                  {MOCK_NEWS.map((news) => (
                    <NewsCard key={news.id} item={news} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Right Column: Index Performance */}
          <div className={cn(
            "flex flex-col h-[calc(100vh-180px)] transition-all duration-500 ease-in-out",
            isPresentationMode ? "col-span-1 lg:col-span-12" : "lg:col-span-5 xl:col-span-4"
          )}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center">
                <span className="w-1 h-6 bg-emerald-500 mr-3 rounded-full"></span>
                Market Performance
              </h2>
              {!isPresentationMode && (
                <button
                  onClick={() => setIsPresentationMode(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center"
                >
                  View All <ExternalLink className="w-3 h-3 ml-1" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="flex space-x-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                    selectedCategory === category
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>

            {fallbackMessage && (
              <div className="mb-4 bg-zinc-800/80 border border-zinc-700 text-yellow-500/90 text-xs px-4 py-2 rounded-lg flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                {fallbackMessage}
              </div>
            )}

            <ScrollArea className="flex-1 pr-2 -mr-2">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="text-sm">Connecting to Alpha Vantage...</p>
                </div>
              ) : marketData.length > 0 ? (
                <div className={cn(
                  "grid gap-4 transition-all duration-500",
                  isPresentationMode ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 xl:grid-cols-2"
                )}>
                  {filteredIndices.map((index) => (
                    <MarketStatCard
                      key={index.symbol}
                      item={index}
                      chartHeight={isPresentationMode ? "h-32" : "h-16"}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                  <p className="text-sm">No market data available.</p>
                </div>
              )}
            </ScrollArea>
          </div>

        </div>
      </main>
    </div>
  );
}
