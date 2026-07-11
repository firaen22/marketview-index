import { beforeEach, describe, expect, it, vi } from 'vitest';

const SETTINGS_KEY = 'marketflow_settings';

describe('settings persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it('setSetting must not clobber keys written by another tab', async () => {
        const { setSetting } = await import('./settings');
        setSetting('lang', 'en');

        const otherTabSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
        otherTabSettings.showFunds = false;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(otherTabSettings));

        setSetting('chartMode', 'percent');

        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({
            lang: 'en',
            chartMode: 'percent',
            showFunds: false,
        });
    });

    it('corrupt legacy fund visibility must not prevent startup and must use the safe default', async () => {
        localStorage.setItem('marketflow_show_funds', '{invalid json');
        const { getSetting } = await import('./settings');

        expect(() => getSetting('showFunds')).not.toThrow();
        expect(getSetting('showFunds')).toBe(true);
    });

    it('corrupt main settings must not prevent startup and must fall back to migration defaults', async () => {
        localStorage.setItem(SETTINGS_KEY, '{invalid json');
        localStorage.setItem('marketflow_lang', 'en');
        const { getSettings } = await import('./settings');

        expect(() => getSettings()).not.toThrow();
        expect(getSettings()).toMatchObject({
            lang: 'en',
            chartMode: 'nominal',
            showFunds: true,
            geminiKey: '',
        });
    });

    it('first load with empty localStorage returns full defaults including newer fields', async () => {
        const { getSettings } = await import('./settings');
        const s = getSettings();
        expect(s).toMatchObject({ lang: 'zh-TW', chartMode: 'nominal', showFunds: true, geminiKey: '', tickerSymbols: null, morningBrief: [] });
        expect(s.presentSlide.mode).toBe('markdown');
        expect(s.presentCycle).toEqual({ enabled: false, dwellSec: 45, views: ['slide', 'heatmap'] });
    });

    it('normalizes missing, null, and partial presentCycle values with deep defaults', async () => {
        const { normalizePresentCycle } = await import('./settings');

        expect(normalizePresentCycle(undefined)).toEqual({ enabled: false, dwellSec: 45, views: ['slide', 'heatmap'] });
        expect(normalizePresentCycle(null)).toEqual({ enabled: false, dwellSec: 45, views: ['slide', 'heatmap'] });
        expect(normalizePresentCycle({ enabled: true })).toEqual({ enabled: true, dwellSec: 45, views: ['slide', 'heatmap'] });
    });

    it('clamps malformed presentCycle dwell seconds', async () => {
        const { normalizePresentCycle } = await import('./settings');

        expect(normalizePresentCycle({ dwellSec: Number.NaN }).dwellSec).toBe(10);
        expect(normalizePresentCycle({ dwellSec: 0 }).dwellSec).toBe(10);
        expect(normalizePresentCycle({ dwellSec: -5 }).dwellSec).toBe(10);
        expect(normalizePresentCycle({ dwellSec: '45' }).dwellSec).toBe(10);
        expect(normalizePresentCycle({ dwellSec: Infinity }).dwellSec).toBe(10);
        expect(normalizePresentCycle({ dwellSec: 7200 }).dwellSec).toBe(3600);
    });

    it('filters and deduplicates presentCycle views while preserving first occurrence', async () => {
        const { normalizePresentCycle } = await import('./settings');

        expect(normalizePresentCycle({ enabled: true, views: [] })).toEqual({ enabled: false, dwellSec: 45, views: [] });
        expect(normalizePresentCycle({ enabled: true, views: ['bogus'] })).toEqual({ enabled: false, dwellSec: 45, views: [] });
        expect(normalizePresentCycle({ enabled: true, views: ['slide'] })).toEqual({ enabled: true, dwellSec: 45, views: ['slide'] });
        expect(normalizePresentCycle({ enabled: true, views: ['heatmap', 'bogus', 'slide', 'heatmap', 'index'] })).toEqual({
            enabled: true,
            dwellSec: 45,
            views: ['heatmap', 'slide', 'index'],
        });
    });

    it('getSettings normalizes stored presentCycle without writing it back', async () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ presentCycle: { enabled: true, dwellSec: 5, views: ['slide', 'slide', 'bogus', 'heatmap'] } }));
        const before = localStorage.getItem(SETTINGS_KEY);
        const { getSettings } = await import('./settings');

        expect(getSettings().presentCycle).toEqual({ enabled: true, dwellSec: 10, views: ['slide', 'heatmap'] });
        expect(localStorage.getItem(SETTINGS_KEY)).toBe(before);
    });
});
