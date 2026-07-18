import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../lib/presentCommand';
import { parseCommandDeterministic } from '../lib/presentCommand';

const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恆生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^N225', name: '日經225', nameEn: 'Nikkei 225', group: 'market' },
    { symbol: '^GSPC', name: '標普500', nameEn: 'S&P 500', group: 'market' },
];

describe('full-width digits (sweep 10)', () => {
    it('parses 第５頁 as goto page 5', () => {
        expect(parseCommandDeterministic('第５頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
    });

    it('parses a bare full-width number as a page jump', () => {
        expect(parseCommandDeterministic('５', catalog)).toEqual({ kind: 'goto', symbols: [], page: 5 });
    });

    it('parses full-width digits in a goto phrase', () => {
        expect(parseCommandDeterministic('跳到第１２頁', catalog)).toEqual({ kind: 'goto', symbols: [], page: 12 });
    });
});

describe('stacked trailing courtesy particles (sweep 10)', () => {
    it('strips a particle followed by an English courtesy word', () => {
        expect(parseCommandDeterministic('唔該幫我睇恒指啦 thanks', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
    });

    it('strips stacked zh particles', () => {
        expect(parseCommandDeterministic('睇恒指先啦', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
    });

    it('still parses the single-particle form', () => {
        expect(parseCommandDeterministic('睇恒指啦', catalog)).toEqual({ kind: 'chart', symbols: ['^HSI'] });
    });
});

describe('regressions guarded from sweep 10 adjudication', () => {
    it('leading 比較 still yields a compare (refuted codex finding)', () => {
        expect(parseCommandDeterministic('比較恒指同日經', catalog)).toEqual({ kind: 'compare', symbols: ['^HSI', '^N225'] });
    });
});
