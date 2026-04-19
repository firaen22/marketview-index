import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Centralized Settings (Issue #14) ---

const SETTINGS_KEY = 'marketflow_settings';

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
}

const DEFAULT_SLIDE: PresentSlide = {
    mode: 'markdown',
    content: '# Market Update\n\nPaste slide content from the control panel to begin.',
    updatedAt: 0,
};

const DEFAULTS: MarketFlowSettings = {
    lang: 'zh-TW',
    chartMode: 'nominal',
    showFunds: true,
    geminiKey: '',
    presentSlide: DEFAULT_SLIDE,
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
        presentSlide: DEFAULTS.presentSlide,
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

// --- Remote slide persistence (Upstash Redis via /api/present-slide) ---

export async function loadRemoteSlide(): Promise<PresentSlide | null> {
    try {
        const res = await fetch('/api/present-slide');
        if (!res.ok) return null;
        const json = await res.json();
        if (json?.slide) return typeof json.slide === 'string' ? JSON.parse(json.slide) : json.slide;
    } catch {}
    return null;
}

export async function uploadPdf(file: File): Promise<string> {
    const res = await fetch('/api/present-pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/pdf',
            'x-filename': encodeURIComponent(file.name),
        },
        body: file,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Upload failed');
    }
    const json = await res.json();
    return json.url as string;
}

export async function saveRemoteSlide(slide: PresentSlide): Promise<void> {
    const res = await fetch('/api/present-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: slide.mode, content: slide.content }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Save failed (${res.status})`);
    }
}

// --- Token injection for live market data ---
// Replaces {{SYMBOL.field}} with live values. Symbol can be bare (SPX) or with caret (^GSPC).
export function injectMarketTokens(
    text: string,
    data: Array<{ symbol: string; name?: string; [k: string]: any }>
): string {
    if (!text || !data?.length) return text;
    return text.replace(/\{\{\s*([\w^.-]+)\.(\w+)\s*\}\}/g, (match, sym, field) => {
        const needle = String(sym).toUpperCase();
        const item = data.find(d => {
            const s = (d.symbol || '').toUpperCase();
            return s === needle || s === `^${needle}` || s.replace('^', '') === needle;
        });
        if (!item) return match;
        const val = item[field];
        if (val == null) return match;
        if (typeof val === 'number') {
            return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return String(val);
    });
}
