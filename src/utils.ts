import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Centralized Settings (Issue #14) ---

const SETTINGS_KEY = 'marketflow_settings';

interface MarketFlowSettings {
    lang: 'en' | 'zh-TW';
    chartMode: 'nominal' | 'percent';
    showFunds: boolean;
    geminiKey: string;
}

const DEFAULTS: MarketFlowSettings = {
    lang: 'zh-TW',
    chartMode: 'nominal',
    showFunds: true,
    geminiKey: '',
};

/**
 * Read all settings in one shot.
 * Includes automatic migration from the old fragmented keys on first read.
 */
export function getSettings(): MarketFlowSettings {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
        try {
            return { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {
            // corrupted – fall through to migration
        }
    }
    // Migrate from legacy keys (one-time)
    const migrated: MarketFlowSettings = {
        lang: (localStorage.getItem('marketflow_lang') as MarketFlowSettings['lang']) || DEFAULTS.lang,
        chartMode: (localStorage.getItem('marketflow_chart_mode') as MarketFlowSettings['chartMode']) || DEFAULTS.chartMode,
        showFunds: (() => {
            const v = localStorage.getItem('marketflow_show_funds');
            return v !== null ? JSON.parse(v) : DEFAULTS.showFunds;
        })(),
        geminiKey: localStorage.getItem('user_gemini_key') || DEFAULTS.geminiKey,
    };
    // Validate
    if (migrated.lang !== 'en' && migrated.lang !== 'zh-TW') migrated.lang = DEFAULTS.lang;
    if (migrated.chartMode !== 'nominal' && migrated.chartMode !== 'percent') migrated.chartMode = DEFAULTS.chartMode;

    // Persist consolidated key and clean up legacy keys
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
    ['marketflow_lang', 'marketflow_chart_mode', 'marketflow_show_funds', 'user_gemini_key'].forEach(k =>
        localStorage.removeItem(k)
    );
    return migrated;
}

/** Update a single setting (merge). */
export function setSetting<K extends keyof MarketFlowSettings>(key: K, value: MarketFlowSettings[K]) {
    const current = getSettings();
    current[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
}

/** Convenience: get one value fast. */
export function getSetting<K extends keyof MarketFlowSettings>(key: K): MarketFlowSettings[K] {
    return getSettings()[key];
}
