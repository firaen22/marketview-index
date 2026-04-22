/**
 * Financial Dashboard Component
 * 
 * Installation:
 * npm install lucide-react recharts clsx tailwind-merge
 * 
 * Ensure Tailwind CSS is configured.
 */
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, LayoutDashboard, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './components/MarketStatCard';
import { MacroStatCard } from './components/MacroStatCard';
import { ScrollArea } from './components/ui';
import { DashboardHeader } from './components/DashboardHeader';
import { NewsSection } from './components/NewsSection';
import { SettingsModal } from './components/SettingsModal';
import { TickerConfigModal } from './components/TickerConfigModal';
import { TimeRangeSelector } from './components/TimeRangeSelector';
import { cn } from './utils';
import { getSettings, setSetting } from './settings';
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
        <DashboardHeader
          t={t}
          language={language}
          lastUpdated={lastUpdated}
          currentTime={currentTime}
          isLoading={isLoading}
          isError={isError}
          isNewsLoading={isNewsLoading}
          isNewsOnly={isNewsOnly}
          chartMode={chartMode}
          geminiKey={geminiKey}
          tickerDisplay={tickerDisplay}
          onToggleNews={() => {
            const next = !isNewsOnly;
            setIsNewsOnly(next);
            if (next) setIsPresentationMode(false);
          }}
          onLangChange={handleLangChange}
          onOpenSettings={() => setShowSettings(true)}
          onToggleChartMode={() => {
            const nextMode = chartMode === 'nominal' ? 'percent' : 'nominal';
            setChartMode(nextMode);
            setSetting('chartMode', nextMode);
          }}
          onRefresh={refresh}
          onOpenTickerConfig={() => setShowTickerConfig(true)}
        />
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
