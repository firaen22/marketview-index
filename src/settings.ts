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
export type PresentView = 'slide' | 'index' | 'heatmap';

export interface PresentCycle {
    enabled: boolean;
    dwellSec: number;
    views: PresentView[];
}

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
    presentCycle: PresentCycle;
    jargonEnabled: boolean;
}

const DEFAULT_SLIDE: PresentSlide = {
    mode: 'markdown',
    content: '# Market Update\n\nPaste slide content from the control panel to begin.',
    updatedAt: 0,
};

const DEFAULT_PRESENT_CYCLE: PresentCycle = {
    enabled: false,
    dwellSec: 45,
    views: ['slide', 'heatmap'],
};

const PRESENT_VIEWS: PresentView[] = ['slide', 'index', 'heatmap'];

let _cache: MarketFlowSettings | null = null;

const DEFAULTS: MarketFlowSettings = {
    lang: 'zh-TW',
    chartMode: 'nominal',
    showFunds: true,
    geminiKey: '',
    presentSlide: DEFAULT_SLIDE,
    tickerSymbols: null,
    morningBrief: [],
    presentCycle: DEFAULT_PRESENT_CYCLE,
    jargonEnabled: true,
};

export function normalizePresentCycle(value: unknown): PresentCycle {
    const input = value && typeof value === 'object' ? value as Partial<PresentCycle> : {};
    const rawDwell = input.dwellSec ?? DEFAULT_PRESENT_CYCLE.dwellSec;
    const dwellSec = typeof rawDwell === 'number' && Number.isFinite(rawDwell)
        ? Math.min(3600, Math.max(10, rawDwell))
        : 10;
    const rawViews = Array.isArray(input.views) ? input.views : DEFAULT_PRESENT_CYCLE.views;
    const views = rawViews.reduce<PresentView[]>((acc, view) => {
        if (!PRESENT_VIEWS.includes(view as PresentView)) return acc;
        if (acc.includes(view as PresentView)) return acc;
        acc.push(view as PresentView);
        return acc;
    }, []);

    return {
        enabled: views.length > 0 ? input.enabled === true : false,
        dwellSec,
        views,
    };
}

function withNormalizedSettings(value: Partial<MarketFlowSettings>): MarketFlowSettings {
    return {
        ...DEFAULTS,
        ...value,
        presentCycle: normalizePresentCycle(value.presentCycle),
    };
}

/**
 * Read all settings in one shot.
 * Includes automatic migration from the old fragmented keys on first read.
 */
function loadFromStorage(): MarketFlowSettings {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
        try {
            return withNormalizedSettings(JSON.parse(raw));
        } catch {
            // corrupted – fall through to migration
        }
    }
    const migrated: MarketFlowSettings = {
        lang: (localStorage.getItem('marketflow_lang') as MarketFlowSettings['lang']) || DEFAULTS.lang,
        chartMode: (localStorage.getItem('marketflow_chart_mode') as MarketFlowSettings['chartMode']) || DEFAULTS.chartMode,
        showFunds: (() => {
            const v = localStorage.getItem('marketflow_show_funds');
            if (v === null) return DEFAULTS.showFunds;
            try {
                return JSON.parse(v);
            } catch {
                return DEFAULTS.showFunds;
            }
        })(),
        geminiKey: localStorage.getItem('user_gemini_key') || DEFAULTS.geminiKey,
        presentSlide: DEFAULTS.presentSlide,
        tickerSymbols: DEFAULTS.tickerSymbols,
        morningBrief: DEFAULTS.morningBrief,
        presentCycle: DEFAULTS.presentCycle,
        jargonEnabled: DEFAULTS.jargonEnabled,
    };
    if (migrated.lang !== 'en' && migrated.lang !== 'zh-TW') migrated.lang = DEFAULTS.lang;
    if (migrated.chartMode !== 'nominal' && migrated.chartMode !== 'percent') migrated.chartMode = DEFAULTS.chartMode;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
    LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
    return withNormalizedSettings(migrated);
}

export function getSettings(): MarketFlowSettings {
    if (_cache) return _cache;
    _cache = loadFromStorage();
    return _cache;
}

export function setSetting<K extends keyof MarketFlowSettings>(key: K, value: MarketFlowSettings[K]) {
    const current = withNormalizedSettings({ ...loadFromStorage(), [key]: value });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    _cache = current;
}

export function getSetting<K extends keyof MarketFlowSettings>(key: K): MarketFlowSettings[K] {
    return getSettings()[key];
}

// cross-tab writes must invalidate the read cache
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === SETTINGS_KEY) _cache = null;
    });
}
