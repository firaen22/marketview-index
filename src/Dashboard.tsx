/**
 * Financial Dashboard Component
 * 
 * Installation:
 * npm install lucide-react recharts clsx tailwind-merge
 * 
 * Ensure Tailwind CSS is configured.
 */
import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Clock, ExternalLink, RefreshCcw, LayoutDashboard, Columns, Loader2, AlertCircle, Settings, X, Cpu, CheckCircle2, ShieldAlert, Newspaper } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Localization ---
const DICTIONARY: Record<string, any> = {
  en: {
    title: "MarketFlow",
    subtitle: "INDEX",
    vip: "VIP Portal Login",
    news: "Core Market News",
    performance: "Market Performance",
    viewAll: "View All Grid",
    poweredBy: "Powered by Gemini AI",
    liveFeed: "Live Feed",
    settings: "System Settings",
    refresh: "Refresh Data",
    ytd: "YTD Change",
    range: "Day Range",
    lastUpdated: "Last Updated",
    loading: "Loading tickers...",
    error: "Market data unavailable.",
    newsLoading: "Gemini is analyzing latest news...",
    noNews: "No recent news available.",
    showAll: "View All",
    goBack: "Go Back",
    apiKey: "Gemini API Key",
    apiKeyPlaceholder: "Enter your Google Gemini API Key",
    saveConfig: "Save Configuration",
    clear: "Clear",
    verify: "Verify",
    verifying: "Verifying...",
    verifySuccess: "Verification Successful",
    verifyFailed: "Verification Failed",
    apiKeyNote: "Provide your own API key to bypass global rate limits and generate real-time AI news summaries. The key is stored locally in your browser.",
    categories: {
      All: "All",
      US: "US",
      Europe: "Europe",
      Asia: "Asia",
      Commodity: "Commodities",
      Crypto: "Crypto",
      Currency: "Currencies",
      Volatility: "Volatility"
    },
    noAiWarning: "AI translation unavailable. Set your Gemini API Key in Settings.",
    dailyPulse: "Daily Market Pulse",
    marketOutlook: "Market Outlook",
    newsOnly: "News Focus",
    allIndices: "All Indices",
    indexNames: {
      "S&P 500": "S&P 500",
      "Nasdaq Composite": "Nasdaq",
      "Dow Jones": "Dow Jones",
      "VIX": "VIX",
      "US Dollar Index": "Dollar Index",
      "Hang Seng Index": "Hang Seng",
      "Nikkei 225": "Nikkei 225",
      "BSE SENSEX": "BSE SENSEX",
      "FTSE 100": "FTSE 100",
      "DAX Performance": "DAX Index",
      "Bitcoin": "Bitcoin",
      "Ethereum": "Ethereum",
      "Crude Oil": "Crude Oil",
      "Gold": "Gold"
    }
  },
  'zh-TW': {
    title: "市場動向",
    subtitle: "指數終端",
    vip: "VIP 專區登入",
    news: "核心市場新聞",
    performance: "市場表現動態",
    viewAll: "全屏顯示模式",
    poweredBy: "由 Gemini AI 提供分析",
    liveFeed: "即時資訊推送",
    settings: "系統詳細設定",
    refresh: "手動更新數據",
    ytd: "年初至今漲跌",
    range: "當日盤中範圍",
    lastUpdated: "數據更新時間",
    loading: "正在讀取市場報價...",
    error: "市場數據暫時失效",
    newsLoading: "Gemini 正在分析最新新聞...",
    noNews: "目前無最新新聞。",
    showAll: "查看全部",
    goBack: "退出全屏",
    apiKey: "Gemini API 金鑰",
    apiKeyPlaceholder: "請輸入您的 Google Gemini API Key",
    saveConfig: "儲存設定",
    clear: "清除",
    verify: "驗證",
    verifying: "驗證中...",
    verifySuccess: "驗證成功",
    verifyFailed: "驗證失敗",
    apiKeyNote: "提供您自己的 API 金鑰以繞過全域速率限制，並產生即時 AI 新聞摘要。此金鑰僅儲存在您的瀏覽器本地。",
    categories: {
      All: "全部",
      US: "美股",
      Europe: "歐股",
      Asia: "亞股",
      Commodity: "大宗商品",
      Crypto: "加密貨幣",
      Currency: "全球匯率",
      Volatility: "波動率"
    },
    noAiWarning: "AI 翻譯暫時無法使用。請在「系統設定」中提供您的 Gemini API 金鑰。",
    dailyPulse: "今日市場脈動",
    marketOutlook: "市場策略展望",
    newsOnly: "新聞專注模式",
    allIndices: "全部指數指標",
    indexNames: {
      "S&P 500": "標普 500 指數",
      "Nasdaq Composite": "納斯達克綜合指數",
      "Dow Jones": "道瓊工業指數",
      "VIX": "恐慌指數 VIX",
      "US Dollar Index": "美元指數",
      "Hang Seng Index": "恆生指數",
      "Nikkei 225": "日經 225 指數",
      "BSE SENSEX": "印度 SENSEX 指數",
      "FTSE 100": "富時 100 指數",
      "DAX Performance": "德國 DAX 指數",
      "Bitcoin": "比特幣",
      "Ethereum": "乙太幣",
      "Crude Oil": "原油期貨",
      "Gold": "黃金期貨"
    }
  }
};

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
  history: { value: number; date?: string }[];
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
  }
];

// --- UI Components ---

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

const TickerItem: React.FC<{ item: IndexData; t: any }> = ({ item, t }) => {
  const isPositive = item.change >= 0;
  return (
    <div className="flex items-center space-x-4 px-6 py-2 border-r border-zinc-800 whitespace-nowrap">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-zinc-400">{item.symbol}</span>
        <span className="text-sm font-semibold text-zinc-100">
          {t?.indexNames?.[item.name] || item.name}
        </span>
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

const NewsCard: React.FC<{ item: NewsItem; language: string }> = ({ item, language }) => {
  const sentimentVariant = item.sentiment.toLowerCase() as 'bullish' | 'bearish' | 'neutral';

  // Localized sentiment display
  const sentimentLabels: Record<string, any> = {
    en: { Bullish: 'Bullish', Bearish: 'Bearish', Neutral: 'Neutral' },
    'zh-TW': { Bullish: '看漲', Bearish: '看跌', Neutral: '中立' }
  };
  const label = sentimentLabels[language]?.[item.sentiment] || item.sentiment;

  return (
    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="block outline-none mb-4">
      <Card className="p-4 hover:bg-zinc-900 transition-colors cursor-pointer group border-zinc-800/60 h-full">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center space-x-2 text-xs text-zinc-500">
            <span className="font-medium text-zinc-400">{item.source}</span>
            <span>•</span>
            <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{item.time}</span>
          </div>
          <Badge variant={sentimentVariant}>{label}</Badge>
        </div>
        <h3 className="text-lg font-bold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors leading-tight text-balance">
          {item.title}
        </h3>
        <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
          {item.summary}
        </p>
      </Card>
    </a>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const dateStr = data.date ? new Date(data.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Live';
    return (
      <div className="bg-zinc-800/95 border border-zinc-700/50 p-2.5 rounded-lg shadow-xl text-xs font-mono z-50 animate-in fade-in zoom-in-95 duration-200">
        <p className="text-zinc-400 mb-1">{dateStr}</p>
        <p className="font-bold text-zinc-100 text-sm">{Number(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
    );
  }
  return null;
};

const MarketStatCard: React.FC<{ item: IndexData; chartHeight?: string; t: any }> = ({ item, chartHeight = "h-16", t }) => {
  const isPositive = item.change >= 0;
  const isYtdPositive = item.ytdChange >= 0;

  return (
    <Card className="p-4 flex flex-col justify-between h-full border-zinc-800/60 transition-all duration-300 hover:border-zinc-700/50">
      <div className="grid grid-cols-[1fr_auto] gap-x-2 items-start mb-5">
        <div className="min-w-0">
          <h4 className="font-bold text-zinc-100 text-sm leading-tight mb-1 line-clamp-2">
            {t?.indexNames?.[item.name] || item.name}
          </h4>
          <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{item.symbol}</span>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className={cn("text-base font-mono font-bold leading-none", isPositive ? "text-emerald-400" : "text-rose-400")}>
            {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={cn("text-[10px] font-mono flex items-center justify-end mt-1 px-1.5 py-0.5 rounded bg-zinc-950/50", isPositive ? "text-emerald-400" : "text-rose-400")}>
            {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className={cn("w-full mb-5 transition-all", chartHeight)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={item.history}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#34d399" : "#fb7185"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: isPositive ? "#34d399" : "#fb7185", stroke: "#18181b", strokeWidth: 2 }}
            />
            <XAxis dataKey="date" hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <YAxis domain={['dataMin', 'dataMax']} hide />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between items-end text-[10px] border-t border-zinc-800/80 pt-3">
        <div className="flex flex-col">
          <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">{t.ytd}</span>
          <span className={cn("font-mono font-medium text-xs", isYtdPositive ? "text-emerald-400" : "text-rose-400")}>
            {isYtdPositive ? '+' : ''}{item.ytdChangePercent.toFixed(2)}%
          </span>
        </div>
        <div className="text-right flex flex-col">
          <span className="text-zinc-500 mb-0.5 uppercase tracking-tighter font-semibold">{t.range}</span>
          <span className="font-mono text-zinc-100 text-[11px] leading-tight">
            {item.low.toLocaleString(undefined, { maximumFractionDigits: 0 })}<br />
            <span className="text-zinc-500 opacity-50">—</span><br />
            {item.high.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </Card>
  );
};

// --- Main Dashboard Component ---

const DailyPulse = ({ summary, t }: { summary: string; t: any }) => {
  if (!summary) return null;
  return (
    <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <TrendingUp className="w-12 h-12 text-blue-500" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-4 h-4 text-blue-400" />
        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{t.dailyPulse}</span>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed font-medium">
        {summary}
      </p>
    </div>
  );
};

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isNewsOnly, setIsNewsOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [timeRange, setTimeRange] = useState<string>('YTD');
  const [language, setLanguage] = useState<'en' | 'zh-TW'>('en'); // Default to 'en' for SSR hydration

  // Hydrate language from localStorage on client mount
  useEffect(() => {
    const savedLang = localStorage.getItem('marketflow_lang') as 'en' | 'zh-TW';
    if (savedLang && (savedLang === 'en' || savedLang === 'zh-TW')) {
      setLanguage(savedLang);
    }
  }, []);

  const t = DICTIONARY[language] || DICTIONARY.en;

  const [marketData, setMarketData] = useState<IndexData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState(true);
  const [isAiTranslated, setIsAiTranslated] = useState(true);
  const [marketSummary, setMarketSummary] = useState<string>('');

  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('user_gemini_key') || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; models?: any[]; recommended?: string; message?: string } | null>(null);

  const handleVerifyKey = async () => {
    if (!geminiKey) return;
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const response = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey })
      });
      const result = await response.json();
      setVerificationResult(result);
    } catch (err) {
      setVerificationResult({ success: false, message: 'Verification failed.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const saveGeminiKey = (key: string) => {
    localStorage.setItem('user_gemini_key', key);
    setGeminiKey(key);
    setShowSettings(false);
    fetchNewsData(language, key, false, true);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'en' ? 'zh-TW' : 'en';
    setLanguage(nextLang);
    localStorage.setItem('marketflow_lang', nextLang);
  };

  const fetchMarketData = async (rangeStr = timeRange, isBackground = false, forceRefresh = false, overrideLang = language) => {
    const CACHE_KEY = `marketflow_cache_${rangeStr}_${overrideLang}`;

    if (!isBackground) {
      setIsLoading(true);
      setIsError(false);
      setFallbackMessage(null);
    }

    try {
      const url = `/api/market-data?t=${new Date().getTime()}&range=${rangeStr}&lang=${overrideLang}${forceRefresh ? '&refresh=true' : ''}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.data && Array.isArray(result.data)) {
        setMarketData(result.data);

        if (!result.success || result.source === 'server_stale_cache') {
          const timeStr = new Date(result.timestamp).toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : undefined);
          setFallbackMessage(language === 'en'
            ? `Could not get latest data, showing backend last updated: ${timeStr} (Global data frozen)`
            : `無法取得最新資料，顯示後端最後更新時間：${timeStr} (全局資料已凍結)`);
        } else {
          setLastUpdated(new Date(result.timestamp));
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: new Date().getTime(),
            data: result.data
          }));
        }
      } else {
        throw new Error(result.error || "Failed to fetch data");
      }
    } catch (err: any) {
      console.error('Failed to fetch market data:', err);
      handleFallback(CACHE_KEY, language === 'en' ? 'Server connection failed. Showing device local cache.' : '伺服器連線失敗。顯示裝置本地快取。');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  };

  const handleFallback = (cacheKey: string, message: string) => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        const timeStr = new Date(timestamp).toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : undefined);
        setMarketData(data);
        setLastUpdated(new Date(timestamp));
        setFallbackMessage(`${message} (${t.lastUpdated}: ${timeStr})`);
      } catch (e) {
        setIsError(true);
        setMarketData([]);
      }
    } else {
      setIsError(true);
      setMarketData([]);
    }
  }

  const fetchNewsData = async (langStr = language, overrideKey?: string, isBackground = false, forceRefresh = false) => {
    if (!isBackground) setIsNewsLoading(true);
    const activeKey = overrideKey !== undefined ? overrideKey : geminiKey;

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

      const url = `/api/market-news?t=${new Date().getTime()}&lang=${langStr}${forceRefresh ? '&refresh=true' : ''}`;
      const response = await fetch(url, { headers });
      const result = await response.json();
      setIsAiTranslated(result.isAiTranslated !== false);
      setMarketSummary(result.marketSummary || '');

      if (result.data && Array.isArray(result.data)) {
        setNewsData(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch news data:', err);
    } finally {
      if (!isBackground) setIsNewsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData(timeRange, false, false, language);
    fetchNewsData(language);

    const pollInterval = setInterval(() => {
      fetchMarketData(timeRange, true, true, language);
      fetchNewsData(language, undefined, true, true);
    }, 60 * 60 * 1000);

    return () => clearInterval(pollInterval);
  }, [timeRange, language]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const categoriesOrder = ['All', 'US', 'Europe', 'Asia', 'Commodity', 'Crypto', 'Currency', 'Volatility'];
  const categories = categoriesOrder.filter(c => c === 'All' || marketData.some(item => item.category === c));

  const filteredIndices = selectedCategory === 'All'
    ? marketData
    : marketData.filter(item => item.category === selectedCategory);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-500/30 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-black/40 backdrop-blur-xl sticky top-0 z-[100]">
        <div className="container mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-xl font-black tracking-tighter text-zinc-100 flex items-center">
                <span className="bg-gradient-to-br from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  {t.title}
                </span>
              </h1>
              <div className="flex items-center text-[10px] text-zinc-500 mt-0.5">
                {lastUpdated ? (
                  <>
                    <span className="opacity-70 mr-1">{t.lastUpdated}:</span>
                    {lastUpdated.toLocaleString(language === 'zh-TW' ? 'zh-TW' : undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </>
                ) : (
                  <span className="opacity-70">Awaiting data...</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center font-mono text-zinc-300 text-[11px] px-3 py-1 bg-zinc-900/50 rounded-full border border-zinc-800">
              <Clock className="w-3 h-3 mr-1.5 text-blue-500" />
              {currentTime.toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : undefined)}
            </div>
            <div className="flex items-center space-x-1 border border-zinc-800 rounded-full p-1 bg-zinc-950/50">
              <button
                onClick={() => setIsNewsOnly(!isNewsOnly)}
                className={cn(
                  "p-1 px-2.5 rounded-full transition-all text-[10px] font-bold flex items-center gap-1.5",
                  isNewsOnly ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                )}
                title={isNewsOnly ? t.allIndices : t.newsOnly}
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isNewsOnly ? t.allIndices : t.newsOnly}</span>
              </button>
              <div className="h-3 w-px bg-zinc-800"></div>
              <button
                onClick={toggleLanguage}
                className="p-1 px-2.5 hover:bg-zinc-800 rounded-full transition-all text-[10px] font-bold text-zinc-300 hover:text-white"
              >
                {language === 'en' ? 'EN' : '中文'}
              </button>
              <div className="h-3 w-px bg-zinc-800"></div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100 relative"
                title={t.settings}
              >
                <Settings className="w-4 h-4" />
                {geminiKey && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full border border-zinc-950" />}
              </button>
            </div>
            <button
              onClick={() => {
                fetchMarketData(timeRange, false, true);
                fetchNewsData(language, undefined, false, true);
              }}
              className={cn("p-2 hover:bg-zinc-900 rounded-full transition-all text-zinc-400 hover:text-zinc-100", (isLoading || isNewsLoading) && "animate-spin")}
              disabled={isLoading || isNewsLoading}
              title={t.refresh}
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ticker Tape */}
        {!isNewsOnly && (
          <div className="overflow-hidden whitespace-nowrap border-b border-zinc-800 bg-zinc-950 flex items-center h-12">
            {isLoading ? (
              <div className="w-full flex items-center justify-center text-xs text-zinc-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.loading}
              </div>
            ) : isError && marketData.length === 0 ? (
              <div className="w-full flex items-center justify-center text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 mr-2" /> {t.error}
              </div>
            ) : (
              <div className="inline-flex animate-ticker">
                {marketData.map((index) => (
                  <TickerItem key={index.symbol} item={index} t={t} />
                ))}
                {marketData.map((index) => (
                  <TickerItem key={`${index.symbol}-dup`} item={index} t={t} />
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4 lg:p-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 transition-all duration-500 ease-in-out">

          {/* Core Market News Column */}
          {(isNewsOnly || !isPresentationMode) && (
            <div className={cn(
              "flex flex-col animate-in fade-in duration-500",
              isNewsOnly ? "lg:col-span-12" : "lg:col-span-5 xl:col-span-4 lg:order-last h-[calc(100vh-180px)]"
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center text-balance">
                  <span className="w-1 h-6 bg-blue-500 mr-3 rounded-full"></span>
                  {t.news}
                </h2>
                {!isAiTranslated && language === 'zh-TW' && (
                  <div className="flex items-center text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded border border-amber-500/20 max-w-[150px] leading-tight">
                    <ShieldAlert className="w-3 h-3 mr-1 flex-shrink-0" />
                    {t.noAiWarning}
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">{t.poweredBy}</span>
                  <Badge variant="default" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{t.liveFeed}</Badge>
                </div>
              </div>

              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-1">
                  {isNewsLoading ? (
                    <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
                      <Loader2 className="w-8 h-8 animate-spin mb-4" />
                      <p className="text-sm">{t.newsLoading}</p>
                    </div>
                  ) : (
                    <>
                      <DailyPulse summary={marketSummary} t={t} />
                      {newsData.length > 0 ? (
                        newsData.map((news) => (
                          <NewsCard key={news.id} item={news} language={language} />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                          <p className="text-sm">{t.noNews}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Right/Left Column Swapped: Index Performance (Now Primary Left Column) */}
          {!isNewsOnly && (
            <div className={cn(
              "flex flex-col h-[calc(100vh-180px)] transition-all duration-500 ease-in-out lg:order-first",
              isPresentationMode ? "col-span-1 lg:col-span-12" : "lg:col-span-7 xl:col-span-8"
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center">
                  <span className="w-1 h-6 bg-emerald-500 mr-3 rounded-full"></span>
                  {t.performance}
                </h2>
                {isPresentationMode ? (
                  <button
                    onClick={() => setIsPresentationMode(false)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center px-2 py-1 bg-blue-500/10 rounded-md border border-blue-500/20 transition-colors"
                  >
                    <LayoutDashboard className="w-3 h-3 mr-1.5" />
                    {t.goBack}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsPresentationMode(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center"
                  >
                    {t.showAll} <ExternalLink className="w-3 h-3 ml-1" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 border",
                        selectedCategory === category
                          ? "bg-zinc-100 text-zinc-900 border-zinc-100 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                          : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                      )}
                    >
                      {t.categories[category] || category}
                    </button>
                  ))}
                </div>

                <div className="flex items-center bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/80 backdrop-blur-md">
                  {['1M', '3M', 'YTD', '1Y'].map(range => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={cn(
                        "px-3 py-1 text-xs font-mono font-medium rounded-md transition-all duration-200 relative",
                        timeRange === range
                          ? "bg-zinc-800 text-zinc-100 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      )}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {fallbackMessage && (
                <div className="mb-4 bg-zinc-800/80 border border-zinc-700 text-yellow-500/90 text-xs px-4 py-2 rounded-lg flex items-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                  {fallbackMessage}
                </div>
              )}

              <ScrollArea className="flex-1 pr-2 -mr-2">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p className="text-sm">{t.loading}</p>
                  </div>
                ) : marketData.length > 0 ? (
                  <div className={cn(
                    "grid gap-4 transition-all duration-500",
                    isPresentationMode ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2"
                  )}>
                    {filteredIndices.map((index) => (
                      <MarketStatCard
                        key={index.symbol}
                        item={index}
                        chartHeight={isPresentationMode ? "h-32" : "h-16"}
                        t={t}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                    <p className="text-sm">{t.noMarketData}</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {
        showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6 border-zinc-700 bg-zinc-900 shadow-2xl scale-in-center overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center">
                  <Settings className="w-5 h-5 mr-3 text-blue-400" />
                  {t.settings}
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center">
                    <Cpu className="w-4 h-4 mr-2 text-indigo-400" />
                    {t.apiKey}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => {
                        setGeminiKey(e.target.value);
                        setVerificationResult(null);
                      }}
                      placeholder={t.apiKeyPlaceholder}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono"
                    />
                    <button
                      onClick={handleVerifyKey}
                      disabled={isVerifying || !geminiKey}
                      className="absolute right-2 top-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-md border border-zinc-700 transition-colors"
                    >
                      {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : t.verify}
                    </button>
                  </div>
                  {verificationResult && (
                    <div className={cn(
                      "p-3 rounded-lg text-xs flex items-start space-x-3 animate-in slide-in-from-top-2 duration-200",
                      verificationResult.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                    )}>
                      {verificationResult.success ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      )}
                      <div className="space-y-1">
                        <p className="font-bold">{verificationResult.success ? t.verifySuccess : t.verifyFailed}</p>
                        <p className="opacity-80">{verificationResult.message || (verificationResult.success ? `Supports ${verificationResult.models?.length} models. Recommended: ${verificationResult.recommended}` : '')}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {t.apiKeyNote}
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => saveGeminiKey(geminiKey)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20"
                  >
                    {t.saveConfig}
                  </button>
                  <button
                    onClick={() => {
                      saveGeminiKey('');
                      setGeminiKey('');
                      setVerificationResult(null);
                    }}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-lg transition-all"
                  >
                    {t.clear}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )
      }
    </div >
  );
}
