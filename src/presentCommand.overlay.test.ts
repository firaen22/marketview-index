import { describe, expect, it } from 'vitest';
import {
    buildPresentCommand,
    buildStructuredCompareCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    isHighlightDay,
    parseCommandDeterministic,
    validatePresentIntent,
} from '../lib/presentCommand';
import { isOverlayImageSrc } from '../lib/presentOverlay';

const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恆生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^IXIC', name: '納斯達克綜合指數', nameEn: 'Nasdaq Composite', group: 'market' },
    { symbol: 'QQQ', name: 'Invesco QQQ', nameEn: 'Invesco QQQ', group: 'market' },
    { symbol: '0P00000EBQ', name: '駿利亨德森遠見基金 - 環球科技領先基金', nameEn: 'Janus Henderson Horizon Fund - Global Technology Leaders Fund', group: 'market' },
    { symbol: 'BTC-USD', name: '比特幣', nameEn: 'Bitcoin', group: 'market' },
    { symbol: 'US10Y', name: '美國十年期債息', nameEn: 'US 10Y Yield', group: 'macro' },
];

describe('compare + range in one utterance', () => {
    it('parses "Hang Seng vs Nasdaq YTD" instead of leaving a 422 remainder', () => {
        expect(parseCommandDeterministic('Hang Seng vs Nasdaq YTD', catalog)).toEqual({
            kind: 'compare',
            symbols: ['^HSI', '^IXIC'],
            range: 'YTD',
        });
    });

    it('parses a range on either side and rejects two different ranges', () => {
        expect(parseCommandDeterministic('HSI YTD vs Nasdaq', catalog)).toEqual({
            kind: 'compare',
            symbols: ['^HSI', '^IXIC'],
            range: 'YTD',
        });
        expect(parseCommandDeterministic('恒指同納指今年', catalog)).toEqual({
            kind: 'compare',
            symbols: ['^HSI', '^IXIC'],
            range: 'YTD',
        });
        expect(parseCommandDeterministic('HSI YTD vs Nasdaq 1Y', catalog)).toBeNull();
    });

    it('still charts a single symbol plus a range', () => {
        expect(parseCommandDeterministic('Nasdaq YTD', catalog)).toEqual({
            kind: 'chart',
            symbols: ['^IXIC'],
            range: 'YTD',
        });
    });
});

describe('H01 and QQQ aliases', () => {
    it('maps voice H01 / 俊利亨德森 to the Janus Henderson tech fund, not a guessed ticker', () => {
        expect(parseCommandDeterministic('H01', catalog)).toEqual({ kind: 'chart', symbols: ['0P00000EBQ'] });
        expect(parseCommandDeterministic('俊利亨德森', catalog)).toEqual({ kind: 'chart', symbols: ['0P00000EBQ'] });
        expect(parseCommandDeterministic('henderson tech', catalog)).toEqual({ kind: 'chart', symbols: ['0P00000EBQ'] });
    });

    it('maps QQ to QQQ and leaves Nasdaq Composite on the nasdaq alias', () => {
        expect(parseCommandDeterministic('QQ', catalog)).toEqual({ kind: 'chart', symbols: ['QQQ'] });
        expect(parseCommandDeterministic('QQQ', catalog)).toEqual({ kind: 'chart', symbols: ['QQQ'] });
        expect(parseCommandDeterministic('nasdaq', catalog)).toEqual({ kind: 'chart', symbols: ['^IXIC'] });
    });

    it('compares the live-call pair with YTD and a date band in one utterance', () => {
        expect(parseCommandDeterministic('H01 vs Nasdaq YTD highlight 2026-05-01 2026-08-31', catalog)).toEqual({
            kind: 'compare',
            symbols: ['0P00000EBQ', '^IXIC'],
            range: 'YTD',
            highlightFrom: '2026-05-01',
            highlightTo: '2026-08-31',
        });
    });

    it('does not invent an H01 alias when the fund is absent from the catalog', () => {
        const withoutFund = catalog.filter(item => item.symbol !== '0P00000EBQ');
        expect(parseCommandDeterministic('H01', withoutFund)).toBeNull();
    });
});

describe('highlight window and overlay commands', () => {
    it('rejects impossible days and reversed windows', () => {
        expect(isHighlightDay('2026-02-31')).toBe(false);
        expect(isHighlightDay('2026-05-01')).toBe(true);
        expect(validatePresentIntent({
            kind: 'compare',
            symbols: ['^HSI', '^IXIC'],
            highlightFrom: '2026-08-31',
            highlightTo: '2026-05-01',
        }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({
            kind: 'clear',
            symbols: [],
            highlightFrom: '2026-05-01',
            highlightTo: '2026-08-31',
        }, catalog)).toEqual({ ok: false });
    });

    it('keeps a valid band on the executable compare command and rejects it on clear', () => {
        const command = buildPresentCommand({
            kind: 'compare',
            symbols: ['0P00000EBQ', '^IXIC'],
            range: 'YTD',
            highlightFrom: '2026-05-01',
            highlightTo: '2026-08-31',
        }, 'band-1', 1000);
        expect(isExecutablePresentCommand(command)).toBe(true);
        expect(isExecutablePresentCommand({ ...command, kind: 'clear', symbols: [] })).toBe(false);
        expect(buildStructuredCompareCommand(
            ['0P00000EBQ', '^IXIC'],
            'ytd',
            { highlightFrom: '2026-05-01', highlightTo: '2026-08-31' },
            'band-2',
            1000,
        )).toMatchObject({
            kind: 'compare',
            symbols: ['0P00000EBQ', '^IXIC'],
            range: 'YTD',
            highlightFrom: '2026-05-01',
            highlightTo: '2026-08-31',
        });
        // Voice nicknames are the text parser's job. The structured action
        // accepts ticker-shaped symbols and lets the projector resolve them.
        expect(buildStructuredCompareCommand(['QQ', '^IXIC'], 'YTD', undefined, 'x', 1000)?.symbols).toEqual(['QQ', '^IXIC']);
        expect(buildStructuredCompareCommand(['QQQ', '^IXIC'], 'nope', undefined, 'x', 1000)).toBeNull();
    });

    it('accepts https and image data urls and rejects scriptable sources', () => {
        expect(isOverlayImageSrc('https://cdn.example/chart.png')).toBe(true);
        expect(isOverlayImageSrc('http://cdn.example/chart.png')).toBe(false);
        expect(isOverlayImageSrc('javascript:alert(1)')).toBe(false);
        const png = `data:image/png;base64,${'A'.repeat(8)}`;
        expect(isOverlayImageSrc(png)).toBe(true);
        expect(isOverlayImageSrc('data:image/svg+xml;base64,AAAA')).toBe(true);
        expect(isOverlayImageSrc('data:text/html;base64,AAAA')).toBe(false);
        const overlay = {
            v: 1 as const,
            id: 'ov',
            kind: 'overlay' as const,
            symbols: [],
            overlay: { type: 'image' as const, src: 'https://cdn.example/chart.svg' },
            issuedAt: 1000,
        };
        expect(isExecutablePresentCommand(overlay)).toBe(true);
        expect(isExecutablePresentCommand({ ...overlay, overlay: { type: 'clear' } })).toBe(true);
        expect(isExecutablePresentCommand({ ...overlay, symbols: ['^HSI'] })).toBe(false);
    });
});
