import { describe, expect, it } from 'vitest';
import {
    buildParsePrompt,
    buildPresentCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    parseCommandDeterministic,
    shouldExecute,
    validatePresentIntent,
} from '../lib/presentCommand';

const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恒生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^GSPC', name: '標普500', nameEn: 'S&P 500', group: 'market' },
    { symbol: '^IXIC', name: '納斯達克', nameEn: 'Nasdaq Composite', group: 'market' },
    { symbol: '^DJI', name: '道瓊斯', nameEn: 'Dow Jones', group: 'market' },
    { symbol: '^FTSE', name: '富時100', nameEn: 'FTSE 100', group: 'market' },
    { symbol: '^N225', name: '日經225', nameEn: 'Nikkei 225', group: 'market' },
    { symbol: 'US10Y', name: '美國十年期債息', nameEn: 'US 10Y Yield', group: 'macro' },
];

describe('parseCommandDeterministic', () => {
    it('returns clear for English and zh-TW clear words', () => {
        expect(parseCommandDeterministic(' clear ', catalog)).toEqual({ kind: 'clear', symbols: [] });
        expect(parseCommandDeterministic('返回', catalog)).toEqual({ kind: 'clear', symbols: [] });
    });

    it('returns view commands for heatmap and dashboard words', () => {
        expect(parseCommandDeterministic('heatmap', catalog)).toEqual({ kind: 'view', symbols: [], view: 'heatmap' });
        expect(parseCommandDeterministic('熱力圖', catalog)).toEqual({ kind: 'view', symbols: [], view: 'heatmap' });
        expect(parseCommandDeterministic('dashboard', catalog)).toEqual({ kind: 'view', symbols: [], view: 'index' });
        expect(parseCommandDeterministic('大盤', catalog)).toEqual({ kind: 'view', symbols: [], view: 'index' });
    });

    it('resolves one market symbol to chart and one macro symbol to quote', () => {
        expect(parseCommandDeterministic('show hsi', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('睇美國十年期債息', catalog)).toEqual({ kind: 'quote', symbols: ['US10Y'] });
    });

    it('resolves exact symbols with or without caret and exact names', () => {
        expect(parseCommandDeterministic('^GSPC', catalog)).toEqual({ kind: 'chart', symbols: ['^GSPC'] });
        expect(parseCommandDeterministic('gspc', catalog)).toEqual({ kind: 'chart', symbols: ['^GSPC'] });
        expect(parseCommandDeterministic('Hang Seng Index', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('恒生指數', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
    });

    it('matches exact localized names case-insensitively, beating ambiguous substrings', () => {
        // "Tencent" is also a substring of "Tencent Music": the exact-name tier
        // must win case-insensitively, not fall through to a 2-match tie.
        const withEnNames: CatalogItem[] = [
            ...catalog,
            { symbol: '0700.HK', name: 'Tencent', group: 'market' },
            { symbol: '1698.HK', name: 'Tencent Music', group: 'market' },
        ];
        expect(parseCommandDeterministic('tencent', withEnNames)).toEqual({ kind: 'chart', symbols: ['0700.HK'] });
        expect(parseCommandDeterministic('TENCENT MUSIC', withEnNames)).toEqual({ kind: 'chart', symbols: ['1698.HK'] });
    });

    it('uses unique substring matches and rejects ambiguous substring matches', () => {
        expect(parseCommandDeterministic('nikkei', catalog)).toEqual({ kind: 'chart', symbols: ['^N225'] });
        expect(parseCommandDeterministic('指數', catalog)).toEqual({ kind: 'view', symbols: [], view: 'index' });
        expect(parseCommandDeterministic('s', catalog)).toBeNull();
    });

    it('parses compare commands with English, punctuation, and CJK separators', () => {
        expect(parseCommandDeterministic('HSI vs S&P 500', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^GSPC'] });
        expect(parseCommandDeterministic('恒生指數，納斯達克', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^IXIC'] });
        expect(parseCommandDeterministic('恒生指數對比標普500', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^GSPC'] });
    });

    it('returns null for a compare command when any part is unresolved', () => {
        expect(parseCommandDeterministic('HSI vs made up', catalog)).toBeNull();
    });

    it('returns null for empty text and unresolved text', () => {
        expect(parseCommandDeterministic('   ', catalog)).toBeNull();
        expect(parseCommandDeterministic('show something impossible', catalog)).toBeNull();
    });
});

describe('validatePresentIntent', () => {
    it('canonicalizes a chart intent without passthrough fields', () => {
        const result = validatePresentIntent({ kind: 'chart', symbols: ['^HSI'], extra: 'x' }, catalog);

        expect(result).toEqual({ ok: true, intent: { kind: 'chart', symbols: ['^HSI'] } });
    });

    it('downgrades compare to chart after dedupe leaves one symbol', () => {
        const result = validatePresentIntent({ kind: 'compare', symbols: ['^HSI', '^HSI'] }, catalog);

        expect(result).toEqual({ ok: true, intent: { kind: 'chart', symbols: ['^HSI'] } });
    });

    it('truncates compare symbols to primary plus four compares', () => {
        const result = validatePresentIntent({
            kind: 'compare',
            symbols: ['^HSI', '^GSPC', '^IXIC', '^DJI', '^FTSE', '^N225'],
        }, catalog);

        expect(result).toEqual({ ok: true, intent: { kind: 'compare', symbols: ['^HSI', '^GSPC', '^IXIC', '^DJI', '^FTSE'] } });
    });

    it('coerces macro chart to quote, rejects macro compare, accepts macro quote', () => {
        // A "chart" of a macro series is what the quote panel shows — coerce
        // instead of 422ing a correct symbol pick ("Show US GDP chart").
        expect(validatePresentIntent({ kind: 'chart', symbols: ['US10Y'] }, catalog)).toEqual({ ok: true, intent: { kind: 'quote', symbols: ['US10Y'] } });
        expect(validatePresentIntent({ kind: 'compare', symbols: ['^HSI', 'US10Y'] }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'quote', symbols: ['US10Y'] }, catalog)).toEqual({ ok: true, intent: { kind: 'quote', symbols: ['US10Y'] } });
    });

    it('rejects symbols not present in the catalog and invalid kind none', () => {
        expect(validatePresentIntent({ kind: 'chart', symbols: ['^FAKE'] }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'none' }, catalog)).toEqual({ ok: false });
    });

    it('validates clear and view shapes exactly enough to canonicalize them', () => {
        expect(validatePresentIntent({ kind: 'clear', symbols: [], view: 'slide' }, catalog)).toEqual({ ok: true, intent: { kind: 'clear', symbols: [] } });
        expect(validatePresentIntent({ kind: 'view', symbols: [], view: 'heatmap' }, catalog)).toEqual({ ok: true, intent: { kind: 'view', symbols: [], view: 'heatmap' } });
        expect(validatePresentIntent({ kind: 'view', symbols: ['^HSI'], view: 'heatmap' }, catalog)).toEqual({ ok: false });
    });
});

describe('buildParsePrompt', () => {
    it('includes catalog rows, kind semantics, none fallback, and verbatim user text', () => {
        const prompt = buildParsePrompt('恒指 vs 標普', catalog.slice(0, 2), 'zh-TW')[0].content;

        expect(prompt).toContain('^HSI\t恒生指數\tHang Seng Index\tmarket');
        expect(prompt).toContain('index = dashboard overview');
        expect(prompt).toContain('respond {"kind":"none"}');
        expect(prompt).toContain('User text: 恒指 vs 標普');
    });
});

describe('isExecutablePresentCommand and shouldExecute', () => {
    it('accepts strict executable command shapes and rejects extra fields', () => {
        const command = buildPresentCommand({ kind: 'chart', symbols: ['^HSI'] }, 'abc', 1000);

        expect(isExecutablePresentCommand(command)).toBe(true);
        expect(isExecutablePresentCommand({ ...command, extra: true })).toBe(false);
        expect(isExecutablePresentCommand({ ...command, symbols: [] })).toBe(false);
        expect(isExecutablePresentCommand({ ...command, issuedAt: NaN })).toBe(false);
    });

    it('requires view only on view commands', () => {
        expect(isExecutablePresentCommand({ v: 1, id: 'v', kind: 'view', symbols: [], view: 'slide', issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'v', kind: 'view', symbols: [], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'v', kind: 'clear', symbols: [], view: 'slide', issuedAt: 1000 })).toBe(false);
    });

    it('requires direction only on page commands', () => {
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: [], direction: 'next', issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: [], direction: 'prev', issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: [], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: [], direction: 'sideways', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: ['^HSI'], direction: 'next', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'clear', symbols: [], direction: 'next', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'view', symbols: [], view: 'slide', direction: 'next', issuedAt: 1000 })).toBe(false);
    });

    it('enforces executor symbol counts and symbol/id bounds', () => {
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'compare', symbols: ['a', 'b', 'c', 'd', 'e'], issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'compare', symbols: ['a'], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'compare', symbols: ['a', 'b', 'c', 'd', 'e', 'f'], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: '', kind: 'clear', symbols: [], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'chart', symbols: ['x'.repeat(25)], issuedAt: 1000 })).toBe(false);
    });

    it('rejects duplicate command ids and stale issuedAt while allowing future timestamps', () => {
        const command = { v: 1, id: 'cmd-1', kind: 'clear', symbols: [], issuedAt: 1_000_000 } as const;

        expect(shouldExecute(command, null, 1_000_000)).toBe(true);
        expect(shouldExecute(command, 'cmd-1', 1_000_000)).toBe(false);
        expect(shouldExecute(command, null, 1_120_001)).toBe(false);
        expect(shouldExecute({ ...command, issuedAt: 2_000_000 }, null, 1_000_000)).toBe(true);
    });
});

describe('separator inside a catalog name', () => {
    it('resolves a full name containing a separator as ONE item, not a compare', () => {
        const catalog: CatalogItem[] = [
            { symbol: 'GVX', name: 'Growth vs Value', group: 'market' },
            { symbol: 'GRW', name: 'Growth', group: 'market' },
            { symbol: 'VAL', name: 'Value', group: 'market' },
        ];
        expect(parseCommandDeterministic('Growth vs Value', catalog))
            .toEqual({ kind: 'chart', symbols: ['GVX'] });
    });
});
