const SETTINGS_KEY = 'marketflow_settings';
const LEGACY_KEYS = ['marketflow_lang', 'marketflow_chart_mode', 'marketflow_show_funds', 'user_gemini_key'] as const;

/**
 * localStorage key builder for per-(range,lang) market-data cache entries
 * consumed by `useDashboardData`. Keeping the format in one place so the
 * cache layout stays consistent across readers/writers.
 */
export const marketCacheKey = (range: string, lang: 'en' | 'zh-TW') =>
    `marketflow_cache_${range}_${lang}`;

export type PresentSlideMode = 'markdown' | 'html' | 'url' | 'pdf';

export interface PresentSlide {
    mode: PresentSlideMode;
    content: string;
    updatedAt: number;
}

interface MarketFlowSettings {
    lang: 'en' | 'zh-TW';
    chartMode: 'nominal' | 'percent';
    showFunds: boolean;
    geminiKey: string;
    presentSlide: PresentSlide;
    tickerSymbols: string[] | null;
    morningBrief: string[];
}

const DEFAULT_SLIDE: PresentSlide = {
    mode: 'markdown',
    content: '# Market Update\n\nPaste slide content from the control panel to begin.',
    updatedAt: 0,
};

let _cache: MarketFlowSettings | null = null;

const DEFAULTS: MarketFlowSettings = {
    lang: 'zh-TW',
    chartMode: 'nominal',
    showFunds: true,
    geminiKey: '',
    presentSlide: DEFAULT_SLIDE,
    tickerSymbols: null,
    morningBrief: [],
};

/**
 * Read all settings in one shot.
 * Includes automatic migration from the old fragmented keys on first read.
 */
export function getSettings(): MarketFlowSettings {
    if (_cache) return _cache;
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
        try {
            _cache = { ...DEFAULTS, ...JSON.parse(raw) };
            return _cache;
        } catch {
            // corrupted – fall through to migration
        }
    }
    const migrated: MarketFlowSettings = {
        lang: (localStorage.getItem('marketflow_lang') as MarketFlowSettings['lang']) || DEFAULTS.lang,
        chartMode: (localStorage.getItem('marketflow_chart_mode') as MarketFlowSettings['chartMode']) || DEFAULTS.chartMode,
        showFunds: (() => {
            const v = localStorage.getItem('marketflow_show_funds');
            return v !== null ? JSON.parse(v) : DEFAULTS.showFunds;
        })(),
        geminiKey: localStorage.getItem('user_gemini_key') || DEFAULTS.geminiKey,
        presentSlide: DEFAULTS.presentSlide,
        tickerSymbols: DEFAULTS.tickerSymbols,
        morningBrief: DEFAULTS.morningBrief,
    };
    if (migrated.lang !== 'en' && migrated.lang !== 'zh-TW') migrated.lang = DEFAULTS.lang;
    if (migrated.chartMode !== 'nominal' && migrated.chartMode !== 'percent') migrated.chartMode = DEFAULTS.chartMode;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
    LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
    _cache = migrated;
    return migrated;
}

export function setSetting<K extends keyof MarketFlowSettings>(key: K, value: MarketFlowSettings[K]) {
    const current = getSettings();
    current[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    _cache = current;
}

export function getSetting<K extends keyof MarketFlowSettings>(key: K): MarketFlowSettings[K] {
    return getSettings()[key];
}
