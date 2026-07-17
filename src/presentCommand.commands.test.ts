import { describe, expect, it } from 'vitest';
import {
    buildParsePrompt,
    buildPresentCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    parseCommandDeterministic,
    validatePresentIntent,
} from '../lib/presentCommand';

const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恒生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^GSPC', name: '標普500', nameEn: 'S&P 500', group: 'market' },
    { symbol: '^N225', name: '日經 225 指數', nameEn: 'Nikkei 225', group: 'market' },
    { symbol: 'US10Y', name: '美國十年期債息', nameEn: 'US 10Y Yield', group: 'macro' },
    { symbol: 'GVX', name: 'Growth vs Value', group: 'market' },
];

describe('new presenter deterministic commands', () => {
    it('parses goto page commands and rejects invalid page text', () => {
        expect(parseCommandDeterministic('5', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
        expect(parseCommandDeterministic('page5', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
        expect(parseCommandDeterministic('pg5', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
        expect(parseCommandDeterministic('第5', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
        expect(parseCommandDeterministic('跳到第十五頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 15 });
        expect(parseCommandDeterministic('第九十九頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 99 });
        expect(parseCommandDeterministic('first page', catalog)).toEqual({ kind: 'goto', symbols: [], page: 'first' });
        expect(parseCommandDeterministic('首頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 'first' });
        expect(parseCommandDeterministic('last page', catalog)).toEqual({ kind: 'goto', symbols: [], page: 'last' });
        expect(parseCommandDeterministic('尾頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 'last' });

        for (const text of ['0', '000', 'page 0', '1000', '5.5', 'page -3', '第一一頁']) {
            expect(parseCommandDeterministic(text, catalog)).toBeNull();
        }
    });

    it('bare 3-digit index shorthand stays a chart; other bare digits page-jump', () => {
        expect(parseCommandDeterministic('500', catalog)).toEqual({ kind: 'chart', symbols: ['^GSPC'] });
        expect(parseCommandDeterministic('225', catalog)).toEqual({ kind: 'chart', symbols: ['^N225'] });
        expect(parseCommandDeterministic('12', catalog)).toEqual({ kind: 'goto', symbols: [], page: 12 });
        // Explicit page phrasing always wins, even for colliding numbers.
        expect(parseCommandDeterministic('page 225', catalog)).toEqual({ kind: 'goto', symbols: [], page: 225 });
    });

    it('parses jargon toggles only with explicit polarity', () => {
        expect(parseCommandDeterministic('jargon on', catalog)).toEqual({ kind: 'jargon', symbols: [], on: true });
        expect(parseCommandDeterministic('術語卡關', catalog)).toEqual({ kind: 'jargon', symbols: [], on: false });
        expect(parseCommandDeterministic('open jargon', catalog)).toEqual({ kind: 'jargon', symbols: [], on: true });
        expect(parseCommandDeterministic('hide jargon', catalog)).toEqual({ kind: 'jargon', symbols: [], on: false });
        expect(parseCommandDeterministic('著術語卡', catalog)).toEqual({ kind: 'jargon', symbols: [], on: true });
        expect(parseCommandDeterministic('jargon', catalog)).toBeNull();
    });

    it('parses cycle toggles and nearest dwell presets', () => {
        expect(parseCommandDeterministic('auto on', catalog)).toEqual({ kind: 'cycle', symbols: [], on: true });
        expect(parseCommandDeterministic('cycle off', catalog)).toEqual({ kind: 'cycle', symbols: [], on: false });
        expect(parseCommandDeterministic('開始輪播', catalog)).toEqual({ kind: 'cycle', symbols: [], on: true });
        expect(parseCommandDeterministic('停播', catalog)).toEqual({ kind: 'cycle', symbols: [], on: false });
        expect(parseCommandDeterministic('autoplay 30', catalog)).toEqual({ kind: 'cycle', symbols: [], on: true, dwellSec: 30 });
        expect(parseCommandDeterministic('auto 31', catalog)).toEqual({ kind: 'cycle', symbols: [], on: true, dwellSec: 30 });
        expect(parseCommandDeterministic('auto 38', catalog)).toEqual({ kind: 'cycle', symbols: [], on: true, dwellSec: 45 });
        expect(parseCommandDeterministic('auto', catalog)).toBeNull();
        expect(parseCommandDeterministic('輪播', catalog)).toBeNull();
        expect(parseCommandDeterministic('auto 0', catalog)).toBeNull();
    });

    it('parses standalone range and conservative chart range commands', () => {
        expect(parseCommandDeterministic('1m', catalog)).toEqual({ kind: 'range', symbols: [], range: '1M' });
        expect(parseCommandDeterministic('3 months', catalog)).toEqual({ kind: 'range', symbols: [], range: '3M' });
        expect(parseCommandDeterministic('今年', catalog)).toEqual({ kind: 'range', symbols: [], range: 'YTD' });
        expect(parseCommandDeterministic('一年', catalog)).toEqual({ kind: 'range', symbols: [], range: '1Y' });
        expect(parseCommandDeterministic('hsi 1y', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'], range: '1Y' });
        expect(parseCommandDeterministic('hsi 1y chart', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'], range: '1Y' });
        expect(parseCommandDeterministic('睇 hsi 一年圖', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'], range: '1Y' });
        expect(parseCommandDeterministic('US10Y 1y', catalog)).toBeNull();
        expect(parseCommandDeterministic('Growth vs Value', catalog)).toEqual({ kind: 'chart', symbols: ['GVX'] });
    });
});

describe('new presenter intent validation', () => {
    it('validates new command kinds and normalizes range casing', () => {
        expect(validatePresentIntent({ kind: 'goto', symbols: [], page: 5 }, catalog)).toEqual({ ok: true, intent: { kind: 'goto', symbols: [], page: 5 } });
        expect(validatePresentIntent({ kind: 'goto', symbols: [], page: 'last', junk: true }, catalog)).toEqual({ ok: true, intent: { kind: 'goto', symbols: [], page: 'last' } });
        expect(validatePresentIntent({ kind: 'jargon', symbols: [], on: false }, catalog)).toEqual({ ok: true, intent: { kind: 'jargon', symbols: [], on: false } });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: 60 }, catalog)).toEqual({ ok: true, intent: { kind: 'cycle', symbols: [], on: true, dwellSec: 60 } });
        expect(validatePresentIntent({ kind: 'range', symbols: [], range: 'ytd' }, catalog)).toEqual({ ok: true, intent: { kind: 'range', symbols: [], range: 'YTD' } });
        expect(validatePresentIntent({ kind: 'chart', symbols: ['^HSI'], range: '1y' }, catalog)).toEqual({ ok: true, intent: { kind: 'chart', symbols: ['^HSI'], range: '1Y' } });
        expect(validatePresentIntent({ kind: 'compare', symbols: ['^HSI', '^GSPC'], range: '3m' }, catalog)).toEqual({ ok: true, intent: { kind: 'compare', symbols: ['^HSI', '^GSPC'], range: '3M' } });
    });

    it('rejects invalid fields for new commands and invalid chart/quote ranges', () => {
        for (const page of [NaN, 5.5, '5', 0, -1, 1000]) {
            expect(validatePresentIntent({ kind: 'goto', symbols: [], page }, catalog)).toEqual({ ok: false });
        }
        expect(validatePresentIntent({ kind: 'goto', symbols: ['^HSI'], page: 5 }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'jargon', symbols: [], on: 'true' }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: 31 }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: 0 }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: -15 }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: 30.5 }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'cycle', symbols: [], on: true, dwellSec: '30' }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'range', symbols: [], range: '2Y' }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'chart', symbols: ['^HSI'], range: '2Y' }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'quote', symbols: ['US10Y'], range: '1Y' }, catalog)).toEqual({ ok: false });
    });
});

describe('new presenter command building and executable checks', () => {
    it('builds commands without undefined-valued keys', () => {
        const commands = [
            buildPresentCommand({ kind: 'goto', symbols: [], page: 5 }, 'g', 1000),
            buildPresentCommand({ kind: 'jargon', symbols: [], on: true }, 'j', 1000),
            buildPresentCommand({ kind: 'cycle', symbols: [], on: false }, 'c', 1000),
            buildPresentCommand({ kind: 'range', symbols: [], range: '1Y' }, 'r', 1000),
            buildPresentCommand({ kind: 'chart', symbols: ['^HSI'], range: '1Y' }, 'ch', 1000),
        ];

        for (const command of commands) {
            expect(Object.values(command)).not.toContain(undefined);
        }
        expect(Object.keys(commands[2])).toEqual(['v', 'id', 'kind', 'symbols', 'on', 'issuedAt']);
    });

    it('accepts and rejects executable command shapes by kind matrix', () => {
        expect(isExecutablePresentCommand({ v: 1, id: 'g', kind: 'goto', symbols: [], page: 'first', issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'j', kind: 'jargon', symbols: [], on: true, issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'cycle', symbols: [], on: true, dwellSec: 30, issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'r', kind: 'range', symbols: [], range: '1Y', issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'ch', kind: 'chart', symbols: ['^HSI'], issuedAt: 1000 })).toBe(true);
        expect(isExecutablePresentCommand({ v: 1, id: 'p', kind: 'page', symbols: [], direction: 'prev', issuedAt: 1000 })).toBe(true);

        expect(isExecutablePresentCommand({ v: 1, id: 'g', kind: 'goto', symbols: ['X'], page: 5, issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'j', kind: 'jargon', symbols: [], issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'c', kind: 'cycle', symbols: [], on: true, dwellSec: 31, issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'r', kind: 'range', symbols: [], range: '5Y', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'r', kind: 'range', symbols: [], range: 'ytd', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'ch', kind: 'chart', symbols: ['^HSI'], view: 'slide', range: '1Y', issuedAt: 1000 })).toBe(false);
        expect(isExecutablePresentCommand({ v: 1, id: 'g', kind: 'goto', symbols: [], page: 5, junk: true, issuedAt: 1000 })).toBe(false);
    });
});

describe('parse prompt for new command kinds', () => {
    it('documents fields, range limits, examples, and unclear toggle fallback', () => {
        const prompt = buildParsePrompt('jargon', catalog, 'en')[0].content;

        expect(prompt).toContain('goto = jump to a slide page');
        expect(prompt).toContain('range must be one of 1M,3M,YTD,1Y');
        expect(prompt).toContain('{"kind":"goto","symbols":[],"page":5}');
        expect(prompt).toContain('{"kind":"chart","symbols":["^HSI"],"range":"1Y"}');
        expect(prompt).toContain('If toggle polarity is unclear, respond {"kind":"none"}');
    });
});
