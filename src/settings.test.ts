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
    });
});
