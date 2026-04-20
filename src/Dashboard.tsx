/**
 * Financial Dashboard Component
 * 
 * Installation:
 * npm install lucide-react recharts clsx tailwind-merge
 * 
 * Ensure Tailwind CSS is configured.
 */
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, ExternalLink, RefreshCcw, LayoutDashboard, Loader2, AlertCircle, Settings, Newspaper, Wallet, MonitorPlay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './components/MarketStatCard';
import { ScrollArea } from './components/ui';
import { TickerItem } from './components/TickerItem';
import { NewsSection } from './components/NewsSection';
import { SettingsModal } from './components/SettingsModal';
import type { IndexData, NewsItem } from './types';
import { cn, getSettings, setSetting } from './utils';
import { useSettingsSync } from './hooks/useSettingsSync';
import localeEn from './locales/en';
import localeZhTW from './locales/zh-TW';

// --- Localization (loaded from src/locales/) ---
const DICTIONARY: Record<string, any> = {
  en: localeEn,
  'zh-TW': localeZhTW
};

export default function Dashboard() {
  const isEmbed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isNewsOnly, setIsNewsOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [timeRange, setTimeRange] = useState<string>('YTD');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const initialSettings = React.useMemo(() => getSettings(), []);
  const [language, setLanguage] = useState<'en' | 'zh-TW'>(initialSettings.lang);
  const [chartMode, setChartMode] = useState<'nominal' | 'percent'>(initialSettings.chartMode);

  // Cross-tab synchronization via consolidated settings key
  useSettingsSync(({ lang, chartMode }) => {
    if (lang) setLanguage(lang);
    if (chartMode) setChartMode(chartMode);
  });

  const baseT = DICTIONARY[language] || DICTIONARY.en;
  const t = {
    ...baseT,
    language,
    activeRange: timeRange,
  };

  const [marketData, setMarketData] = useState<IndexData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState(true);
  const [isAiTranslated, setIsAiTranslated] = useState(true);
  const [marketSummary, setMarketSummary] = useState<string>('');

  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState(initialSettings.geminiKey);

  const [showFundsInDashboard, setShowFundsInDashboard] = useState(initialSettings.showFunds);

  const saveGeminiKey = (key: string) => {
    setSetting('geminiKey', key);
    setGeminiKey(key);
    setShowSettings(false);
    fetchNewsData(language, key, false, true);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'en' ? 'zh-TW' : 'en';
    setLanguage(nextLang);
    setSetting('lang', nextLang);
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
      fetchMarketData(timeRange, true, false, language);
      fetchNewsData(language, undefined, true, false);
    }, 60 * 60 * 1000);

    return () => clearInterval(pollInterval);
  }, [timeRange, language]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const categoriesOrder = ['All', 'US', 'Europe', 'Asia', 'Fund', 'Commodity', 'Crypto', 'Currency', 'Volatility'];
  const displayMarketData = showFundsInDashboard ? marketData : marketData.filter(item => item.category !== 'Fund');
  const categories = categoriesOrder.filter(c => c === 'All' || displayMarketData.some(item => item.category === c));

  const filteredIndices = (selectedCategory === 'All'
    ? displayMarketData
    : displayMarketData.filter(item => item.category === selectedCategory)
  ).sort((a, b) => sortOrder === 'desc' ? b.ytdChangePercent - a.ytdChangePercent : a.ytdChangePercent - b.ytdChangePercent);

  // Rendering...

  return (
    <div
      className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-500/30 font-sans"
      style={{ ['--dash-offset' as any]: isEmbed ? '48px' : '180px' }}
    >
      {/* Header */}
      {!isEmbed && (
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
                  <span className="opacity-70">{t.awaitingData}</span>
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
                onClick={() => {
                  const nextState = !isNewsOnly;
                  setIsNewsOnly(nextState);
                  if (nextState) setIsPresentationMode(false);
                }}
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
              <div className="h-3 w-px bg-zinc-800"></div>
              <button
                onClick={() => {
                  const nextMode = chartMode === 'nominal' ? 'percent' : 'nominal';
                  setChartMode(nextMode);
                  setSetting('chartMode', nextMode);
                }}
                className="p-1 px-2.5 hover:bg-zinc-800 rounded-full transition-all text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1.5"
                title={t.chartModeLabel}
              >
                {chartMode === 'nominal' ? (
                  <>
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t.nominal}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.percent}</span>
                  </>
                )}
              </button>
              <div className="h-3 w-px bg-zinc-800"></div>
              <Link
                to="/funds"
                className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100"
                title={t.funds}
              >
                <Wallet className="w-4 h-4" />
              </Link>
              <div className="h-3 w-px bg-zinc-800"></div>
              <Link
                to="/heatmap"
                className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-100"
                title={t.heatmap}
              >
                <LayoutDashboard className="w-4 h-4" />
              </Link>
              <div className="h-3 w-px bg-zinc-800"></div>
              <Link
                to="/present"
                className="p-1 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-emerald-400"
                title="Presentation View"
              >
                <MonitorPlay className="w-4 h-4" />
              </Link>
              <div className="h-3 w-px bg-zinc-800"></div>
              <Link
                to="/present-control"
                className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md text-emerald-400 transition-all text-xs font-semibold"
                title="Open Presentation Control"
              >
                <span>Control</span>
              </Link>
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
        <div className="overflow-hidden whitespace-nowrap border-b border-zinc-800 bg-zinc-950 flex items-center h-12">
          {isLoading ? (
            <div className="w-full flex items-center justify-center text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.loading}
            </div>
          ) : isError && displayMarketData.length === 0 ? (
            <div className="w-full flex items-center justify-center text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 mr-2" /> {t.error}
            </div>
          ) : (
            <div className="inline-flex animate-ticker" aria-label="Market ticker">
              {displayMarketData.map((index) => (
                <TickerItem key={index.symbol} item={index} t={t} />
              ))}
              {/* Duplicate for seamless CSS -50% translate loop — aria-hidden keeps screen readers clean */}
              <span aria-hidden="true" className="inline-flex">
                {displayMarketData.map((index) => (
                  <TickerItem key={`${index.symbol}-dup`} item={index} t={t} />
                ))}
              </span>
            </div>
          )}
        </div>
      </header>
      )}

      {/* Main Content */}
      <main className="container mx-auto p-4 lg:p-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 transition-all duration-500 ease-in-out">

          {(isNewsOnly || !isPresentationMode) && (
            <NewsSection
              isNewsOnly={isNewsOnly}
              isNewsLoading={isNewsLoading}
              isAiTranslated={isAiTranslated}
              language={language}
              marketSummary={marketSummary}
              marketData={marketData}
              newsData={newsData}
              t={t}
            />
          )}

          {/* Right/Left Column Swapped: Index Performance (Now Primary Left Column) */}
          {!isNewsOnly && (
            <div className={cn(
              "flex flex-col h-[calc(100vh-var(--dash-offset,180px))] transition-all duration-500 ease-in-out lg:order-first",
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
                  <button
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className={cn(
                      "hidden sm:flex items-center ml-2 px-2 py-1 bg-zinc-900/30 rounded border transition-colors cursor-pointer",
                      sortOrder === 'desc' ? "border-emerald-500/20 hover:border-emerald-500/40" : "border-rose-500/20 hover:border-rose-500/40"
                    )}
                    title={language === 'en' ? 'Toggle sort order' : '切換排序方式'}
                  >
                    {sortOrder === 'desc' ? (
                      <TrendingUp className="w-3 h-3 text-emerald-400 mr-1.5" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-rose-400 mr-1.5" />
                    )}
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                      {language === 'en'
                        ? (sortOrder === 'desc' ? 'High to Low' : 'Low to High')
                        : (sortOrder === 'desc' ? '高至低排序' : '低至高排序')}
                    </span>
                  </button>
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
                        chartMode={chartMode}
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

      {showSettings && (
        <SettingsModal
          initialKey={geminiKey}
          initialShowFunds={showFundsInDashboard}
          t={t}
          onClose={() => setShowSettings(false)}
          onSave={saveGeminiKey}
          onShowFundsChange={setShowFundsInDashboard}
        />
      )}
    </div>
  );
}
