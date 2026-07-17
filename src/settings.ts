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
// True after a setSetting write failed to persist — storage is stale from
// that point, so setSetting must stop treating it as the source of truth.
let _persistFailed = false;

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

export function safeGetItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function safeSetItem(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        // Storage can be unavailable in private or embedded contexts.
        return false;
    }
}

export function safeRemoveItem(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Storage can be unavailable in private or embedded contexts.
    }
}

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

// Keep in sync with PresentSlideMode and isValidPresentSlide in slideApi.ts
// (not imported from there: settings.ts must stay free of module side effects).
const SLIDE_MODES: PresentSlideMode[] = ['markdown', 'html', 'url', 'pdf'];

function normalizePresentSlide(value: unknown): PresentSlide {
    if (!value || typeof value !== 'object') return DEFAULT_SLIDE;
    const slide = value as Record<string, unknown>;
    if (!SLIDE_MODES.includes(slide.mode as PresentSlideMode)) return DEFAULT_SLIDE;
    if (typeof slide.content !== 'string') return DEFAULT_SLIDE;
    if (typeof slide.updatedAt !== 'number' || !Number.isFinite(slide.updatedAt)) return DEFAULT_SLIDE;
    return { mode: slide.mode as PresentSlideMode, content: slide.content, updatedAt: slide.updatedAt };
}

function stringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    return value.filter((v): v is string => typeof v === 'string');
}

// The consolidated key is written by other tabs and app versions, so every
// field is re-validated on read; corrupt values fall back per-field to DEFAULTS.
function withNormalizedSettings(value: Partial<MarketFlowSettings>): MarketFlowSettings {
    return {
        lang: value.lang === 'en' || value.lang === 'zh-TW' ? value.lang : DEFAULTS.lang,
        chartMode: value.chartMode === 'nominal' || value.chartMode === 'percent' ? value.chartMode : DEFAULTS.chartMode,
        showFunds: typeof value.showFunds === 'boolean' ? value.showFunds : DEFAULTS.showFunds,
        geminiKey: typeof value.geminiKey === 'string' ? value.geminiKey : DEFAULTS.geminiKey,
        presentSlide: normalizePresentSlide(value.presentSlide),
        tickerSymbols: value.tickerSymbols === null ? null : stringArray(value.tickerSymbols) ?? DEFAULTS.tickerSymbols,
        morningBrief: stringArray(value.morningBrief) ?? DEFAULTS.morningBrief,
        presentCycle: normalizePresentCycle(value.presentCycle),
        jargonEnabled: typeof value.jargonEnabled === 'boolean' ? value.jargonEnabled : DEFAULTS.jargonEnabled,
    };
}

/**
 * Read all settings in one shot.
 * Includes automatic migration from the old fragmented keys on first read.
 */
function loadFromStorage(): MarketFlowSettings {
    const raw = safeGetItem(SETTINGS_KEY);
    if (raw) {
        try {
            return withNormalizedSettings(JSON.parse(raw));
        } catch {
            // corrupted – fall through to migration
        }
    }
    const migrated: MarketFlowSettings = {
        lang: (safeGetItem('marketflow_lang') as MarketFlowSettings['lang']) || DEFAULTS.lang,
        chartMode: (safeGetItem('marketflow_chart_mode') as MarketFlowSettings['chartMode']) || DEFAULTS.chartMode,
        showFunds: (() => {
            const v = safeGetItem('marketflow_show_funds');
            if (v === null) return DEFAULTS.showFunds;
            try {
                return JSON.parse(v);
            } catch {
                return DEFAULTS.showFunds;
            }
        })(),
        geminiKey: safeGetItem('user_gemini_key') || DEFAULTS.geminiKey,
        presentSlide: DEFAULTS.presentSlide,
        tickerSymbols: DEFAULTS.tickerSymbols,
        morningBrief: DEFAULTS.morningBrief,
        presentCycle: DEFAULTS.presentCycle,
        jargonEnabled: DEFAULTS.jargonEnabled,
    };
    if (migrated.lang !== 'en' && migrated.lang !== 'zh-TW') migrated.lang = DEFAULTS.lang;
    if (migrated.chartMode !== 'nominal' && migrated.chartMode !== 'percent') migrated.chartMode = DEFAULTS.chartMode;

    // Only retire the legacy keys once the consolidated write actually landed —
    // if it failed (quota/private browsing) they are the sole durable copy of
    // e.g. the user's Gemini key. A failed write also marks storage stale so
    // setSetting stops treating re-reads as the source of truth.
    const persisted = safeSetItem(SETTINGS_KEY, JSON.stringify(migrated));
    _persistFailed = !persisted;
    if (persisted) LEGACY_KEYS.forEach(k => safeRemoveItem(k));
    return withNormalizedSettings(migrated);
}

export function getSettings(): MarketFlowSettings {
    if (_cache) return _cache;
    _cache = loadFromStorage();
    return _cache;
}

export function setSetting<K extends keyof MarketFlowSettings>(key: K, value: MarketFlowSettings[K]) {
    // Healthy storage: re-read it so writes from other tabs (or direct writers
    // that bypass setSetting) are never clobbered. After a FAILED write
    // (private browsing), storage is stale by definition — base on _cache so
    // earlier in-memory changes survive the session.
    const base = _persistFailed && _cache ? _cache : loadFromStorage();
    const current = withNormalizedSettings({ ...base, [key]: value });
    _persistFailed = !safeSetItem(SETTINGS_KEY, JSON.stringify(current));
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
