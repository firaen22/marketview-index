import { describe, expect, it } from 'vitest';
import {
    buildParsePrompt,
    buildPresentCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    parseCommandDeterministic,
    validatePresentIntent,
} from '../lib/presentCommand';

// Mirrors the REAL prod control-page catalog after localization: zh display
// name + English nameEn for indices (sweep: the copilot NLU fixes, 2026-07-18).
const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恆生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^GSPC', name: '標普 500 指數', nameEn: 'S&P 500', group: 'market' },
    { symbol: '^IXIC', name: '納斯達克綜合指數', nameEn: 'Nasdaq Composite', group: 'market' },
    { symbol: '^N225', name: '日經 225 指數', nameEn: 'Nikkei 225', group: 'market' },
    { symbol: 'GC=F', name: '黃金期貨', nameEn: 'Gold', group: 'market' },
    { symbol: 'CL=F', name: '原油期貨', nameEn: 'Crude Oil', group: 'market' },
    { symbol: 'BTC-USD', name: '比特幣', nameEn: 'Bitcoin', group: 'market' },
    { symbol: 'CPIAUCSL', name: '消費者物價指數 (CPI)', nameEn: 'Consumer Price Index (CPI)', group: 'macro' },
];

describe('nickname aliases', () => {
    it('resolves spoken index nicknames exactly', () => {
        expect(parseCommandDeterministic('恒指', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('納指', catalog)).toEqual({ kind: 'chart', symbols: ['^IXIC'] });
        expect(parseCommandDeterministic('標普', catalog)).toEqual({ kind: 'chart', symbols: ['^GSPC'] });
        expect(parseCommandDeterministic('金價', catalog)).toEqual({ kind: 'chart', symbols: ['GC=F'] });
        expect(parseCommandDeterministic('油價', catalog)).toEqual({ kind: 'chart', symbols: ['CL=F'] });
    });

    it('resolves nickname + generic chart noun and verb shells', () => {
        expect(parseCommandDeterministic('標普500走勢', catalog)).toEqual({ kind: 'chart', symbols: ['^GSPC'] });
        expect(parseCommandDeterministic('睇下恒指', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('幫我開比特幣個圖', catalog)).toEqual({ kind: 'chart', symbols: ['BTC-USD'] });
        expect(parseCommandDeterministic('gold price', catalog)).toEqual({ kind: 'chart', symbols: ['GC=F'] });
    });

    it('does not alias-match inside longer unresolvable text (exact only)', () => {
        expect(parseCommandDeterministic('goldman sachs fund', catalog)).toBeNull();
        expect(parseCommandDeterministic('oil services etf', catalog)).toBeNull();
    });

    it('aliases only apply to symbols present in the catalog', () => {
        const noGold = catalog.filter(item => item.symbol !== 'GC=F');
        expect(parseCommandDeterministic('金價', noGold)).toBeNull();
    });
});

describe('courtesy stripping', () => {
    it('strips politeness shells and punctuation before parsing', () => {
        expect(parseCommandDeterministic('唔該幫我開返個術語卡。', catalog)).toEqual({ kind: 'jargon', symbols: [], on: true });
        expect(parseCommandDeterministic('show hsi please', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('熄咗個自動輪播佢', catalog)).toEqual({ kind: 'cycle', symbols: [], on: false });
    });
});

describe('page turns as text', () => {
    it('parses English and zh page turns deterministically', () => {
        expect(parseCommandDeterministic('next page', catalog)).toEqual({ kind: 'page', symbols: [], direction: 'next' });
        expect(parseCommandDeterministic('Go to the next slide please.', catalog)).toEqual({ kind: 'page', symbols: [], direction: 'next' });
        expect(parseCommandDeterministic('previous page', catalog)).toEqual({ kind: 'page', symbols: [], direction: 'prev' });
        expect(parseCommandDeterministic('下一頁', catalog)).toEqual({ kind: 'page', symbols: [], direction: 'next' });
        expect(parseCommandDeterministic('唔該幫我翻去上一頁。', catalog)).toEqual({ kind: 'page', symbols: [], direction: 'prev' });
    });

    it('keeps bare "back" as clear, not a page turn', () => {
        expect(parseCommandDeterministic('back', catalog)).toEqual({ kind: 'clear', symbols: [] });
    });

    it('validates and builds an executable page command', () => {
        const validated = validatePresentIntent({ kind: 'page', symbols: [], direction: 'next' }, catalog);
        expect(validated).toEqual({ ok: true, intent: { kind: 'page', symbols: [], direction: 'next' } });
        if (!validated.ok) return;
        const command = buildPresentCommand(validated.intent, 'id-1', 1000);
        expect(command).toEqual({ v: 1, id: 'id-1', kind: 'page', symbols: [], direction: 'next', issuedAt: 1000 });
        expect(isExecutablePresentCommand(command)).toBe(true);
    });

    it('rejects page intents with a bad direction', () => {
        expect(validatePresentIntent({ kind: 'page', symbols: [], direction: 'sideways' }, catalog)).toEqual({ ok: false });
        expect(validatePresentIntent({ kind: 'page', symbols: [] }, catalog)).toEqual({ ok: false });
    });
});

describe('explain vs market-question routing', () => {
    it('routes "what is <catalog item>" to chart/quote instead of a jargon card', () => {
        expect(parseCommandDeterministic("what's the hang seng", catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('咩係恒指', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
        expect(parseCommandDeterministic('what is cpi', catalog)).toEqual({ kind: 'quote', symbols: ['CPIAUCSL'] });
    });

    it('falls through to NLU for market questions with junk terms', () => {
        expect(parseCommandDeterministic("what's the S&P doing", catalog)).toBeNull();
        expect(parseCommandDeterministic('what is gold at today', catalog)).toBeNull();
    });

    it('keeps clean concept terms as explain cards', () => {
        expect(parseCommandDeterministic('what is quantitative easing', catalog)).toEqual({ kind: 'explain', symbols: [], term: 'quantitative easing' });
        expect(parseCommandDeterministic('what is a drawdown', catalog)).toEqual({ kind: 'explain', symbols: [], term: 'a drawdown' });
        expect(parseCommandDeterministic('咩叫量化寬鬆？', catalog)).toEqual({ kind: 'explain', symbols: [], term: '量化寬鬆' });
    });

    it('extracts the term from Cantonese particle/trailer shells', () => {
        expect(parseCommandDeterministic('唔該同我解釋下 Duration 係咩意思。', catalog)).toEqual({ kind: 'explain', symbols: [], term: 'Duration' });
        // Terms genuinely starting with 下 are not eaten by the particle strip.
        expect(parseCommandDeterministic('解釋下行風險', catalog)).toEqual({ kind: 'explain', symbols: [], term: '下行風險' });
    });

    it('sends why-questions to the NLU instead of a junk explain term', () => {
        expect(parseCommandDeterministic('幫我解釋下殖利率曲線點解會倒掛', catalog)).toBeNull();
    });
});

describe('bare range shells', () => {
    it('parses verb + range + chart-noun shells as range switches', () => {
        expect(parseCommandDeterministic('睇返一年圖', catalog)).toEqual({ kind: 'range', symbols: [], range: '1Y' });
        expect(parseCommandDeterministic('睇返 1-year timeline', catalog)).toEqual({ kind: 'range', symbols: [], range: '1Y' });
        expect(parseCommandDeterministic('switch to 3 months', catalog)).toEqual({ kind: 'range', symbols: [], range: '3M' });
    });

    it('does not steal symbol + range utterances', () => {
        expect(parseCommandDeterministic('恒指一年圖', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'], range: '1Y' });
        expect(parseCommandDeterministic('1y hsi', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'], range: '1Y' });
    });
});

describe('compare widening', () => {
    it('splits on 同/and while keeping whole-name resolution first', () => {
        expect(parseCommandDeterministic('恒指同日經比較', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^N225'] });
        expect(parseCommandDeterministic('compare nasdaq with s&p', catalog)).toEqual({ kind: 'compare', symbols: ['^IXIC', '^GSPC'] });
        expect(parseCommandDeterministic('hang seng and nikkei', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^N225'] });
    });
});

describe('NLU prompt', () => {
    it('includes the page kind, aliases column, and sanitized fields', () => {
        const prompt = buildParsePrompt('下一頁', catalog, 'zh-TW');
        const content = prompt[0].content;
        expect(content).toContain('"direction":"next"');
        expect(content).toContain('恒指');
        expect(content).toContain('aliases');
        const evil: CatalogItem[] = [{ symbol: 'X', name: 'bad\tname\nhere', group: 'market' }];
        const evilContent = buildParsePrompt('x', evil, 'en')[0].content;
        expect(evilContent).toContain('bad name here');
    });
});
