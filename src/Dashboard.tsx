/**
 * Financial Dashboard Component
 * 
 * Installation:
 * npm install lucide-react recharts clsx tailwind-merge
 * 
 * Ensure Tailwind CSS is configured.
 */
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, ExternalLink, RefreshCcw, LayoutDashboard, Loader2, AlertCircle, Settings, Newspaper, Wallet, MonitorPlay, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './components/MarketStatCard';
import { MacroStatCard } from './components/MacroStatCard';
import { ScrollArea } from './components/ui';
import { TickerItem } from './components/TickerItem';
import { NewsSection } from './components/NewsSection';
import { SettingsModal } from './components/SettingsModal';
import { TickerConfigModal } from './components/TickerConfigModal';
import { TimeRangeSelector } from './components/TimeRangeSelector';
import { LangToggle } from './components/LangToggle';
import { cn, getSettings, setSetting } from './utils';
import { CATEGORIES_ORDER } from './constants';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useDashboardData } from './hooks/useDashboardData';
import { useMacroData } from './hooks/useMacroData';
import { getLocale } from './locales';

export default function Dashboard() {
  const isEmbed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isNewsOnly, setIsNewsOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [timeRange, setTimeRange] = useState<string>('YTD');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const initialSettings = React.useMemo(() => getSettings(), []);
  const [language, setLanguage] = useState<'en' | 'zh-TW'>(initialSettings.lang);
  const [chartMode, setChartMode] = useState<'nominal' | 'percent'>(initialSettings.chartMode);

  // Cross-tab synchronization via consolidated settings key
  useSettingsSync(({ lang, chartMode, tickerSymbols }) => {
    if (lang) setLanguage(lang);
    if (chartMode) setChartMode(chartMode);
    if (tickerSymbols !== undefined) setTickerSymbols(tickerSymbols);
  });

  const t = React.useMemo(() => ({
    ...getLocale(language),
    language,
    activeRange: timeRange,
  }), [language, timeRange]);

  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState(initialSettings.geminiKey);

  const [showFundsInDashboard, setShowFundsInDashboard] = useState(initialSettings.showFunds);
  const [tickerSymbols, setTickerSymbols] = useState<string[] | null>(initialSettings.tickerSymbols);
  const [showTickerConfig, setShowTickerConfig] = useState(false);

  const {
    marketData, isLoading, isError, fallbackMessage, lastUpdated,
    newsData, isNewsLoading, isAiTranslated, marketSummary,
    refresh, refreshNewsWithKey,
  } = useDashboardData({ timeRange, language, geminiKey, lastUpdatedLabel: t.lastUpdated });

  const { data: macroData } = useMacroData({ lang: language, refreshMs: 60 * 60 * 1000 });

  const saveGeminiKey = (key: string) => {
    setSetting('geminiKey', key);
    setGeminiKey(key);
    setShowSettings(false);
    refreshNewsWithKey(key);
  };

  const handleLangChange = (nextLang: 'en' | 'zh-TW') => {
    setLanguage(nextLang);
    setSetting('lang', nextLang);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const categoriesOrder = CATEGORIES_ORDER;
  const displayMarketData = showFundsInDashboard ? marketData : marketData.filter(item => item.category !== 'Fund');
  const tickerData = tickerSymbols === null
    ? marketData
    : marketData.filter(item => tickerSymbols.includes(item.symbol));
  const tickerDisplay = tickerData.length > 0 ? tickerData : marketData;
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
              <LangToggle
                language={language}
                onChange={handleLangChange}
                className="p-1 px-2.5 hover:bg-zinc-800 rounded-full transition-all text-[10px] font-bold text-zinc-300 hover:text-white"
              />
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
              onClick={refresh}
              className={cn("p-2 hover:bg-zinc-900 rounded-full transition-all text-zinc-400 hover:text-zinc-100", (isLoading || isNewsLoading) && "animate-spin")}
              disabled={isLoading || isNewsLoading}
              title={t.refresh}
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ticker Tape */}
        <div className="relative overflow-hidden whitespace-nowrap border-b border-zinc-800 bg-zinc-950 flex items-center h-12">
          {isLoading ? (
            <div className="w-full flex items-center justify-center text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.loading}
            </div>
          ) : isError && tickerDisplay.length === 0 ? (
            <div className="w-full flex items-center justify-center text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 mr-2" /> {t.error}
            </div>
          ) : (
            <div className="inline-flex animate-ticker" aria-label="Market ticker">
              {tickerDisplay.map((index) => (
                <TickerItem key={index.symbol} item={index} t={t} />
              ))}
              {/* Duplicate for seamless CSS -50% translate loop — aria-hidden keeps screen readers clean */}
              <span aria-hidden="true" className="inline-flex">
                {tickerDisplay.map((index) => (
                  <TickerItem key={`${index.symbol}-dup`} item={index} t={t} />
                ))}
              </span>
            </div>
          )}
          <button
            onClick={() => setShowTickerConfig(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-emerald-400 transition"
            title={t.tickerConfig?.open || 'Configure ticker'}
          >
            <ListChecks className="w-3.5 h-3.5" />
          </button>
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
                    title={t.sort.toggle}
                  >
                    {sortOrder === 'desc' ? (
                      <TrendingUp className="w-3 h-3 text-emerald-400 mr-1.5" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-rose-400 mr-1.5" />
                    )}
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                      {sortOrder === 'desc' ? t.sort.highToLow : t.sort.lowToHigh}
                    </span>
                  </button>
                </div>

                <TimeRangeSelector value={timeRange} onChange={setTimeRange} variant="subtle" />
              </div>

              {fallbackMessage && (
                <div className="mb-4 bg-zinc-800/80 border border-zinc-700 text-yellow-500/90 text-xs px-4 py-2 rounded-lg flex items-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                  {fallbackMessage}
                </div>
              )}

              <ScrollArea className="flex-1 pr-2 -mr-2">
                {macroData.length > 0 && (
                  <div className="mb-6">
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">
                      {t.macroData || 'Economic Data'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {macroData.map((item) => (
                        <MacroStatCard key={item.symbol} item={item} t={t} />
                      ))}
                    </div>
                  </div>
                )}
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

      {showTickerConfig && (
        <TickerConfigModal
          allSymbols={marketData}
          selected={tickerSymbols}
          language={language}
          t={t}
          onClose={() => setShowTickerConfig(false)}
          onSave={setTickerSymbols}
        />
      )}
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
