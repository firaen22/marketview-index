import { describe, it, expect } from 'vitest';
import { VALID_RANGES } from '../api/market-data';
import { buildParsePrompt, parseCommandDeterministic, PRESENT_RANGES, type CatalogItem } from '../lib/presentCommand';
import { TIME_RANGES as SELECTOR_RANGES } from './components/TimeRangeSelector';
import { TIME_RANGES as CONSTANT_RANGES } from './constants';
import en from './locales/en';
import zhTW from './locales/zh-TW';

/**
 * The time-range set is duplicated across the UI selector, the app-wide
 * constant, the copilot command parser, and the server's query validator.
 * TypeScript only asserts parity between the TimeRange and PresentRange
 * *unions* — a list that falls out of sync still compiles, and the failure is
 * silent: the server quietly coerces an unknown range to YTD, so a presenter
 * clicking "5Y" would get YTD data with no error anywhere.
 */
describe('time range parity across frontend, copilot and server', () => {
    const expected = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];

    it('every range list holds the same values in the same order', () => {
        expect([...SELECTOR_RANGES]).toEqual(expected);
        expect([...CONSTANT_RANGES]).toEqual(expected);
        expect([...PRESENT_RANGES]).toEqual(expected);
    });

    it('the server accepts exactly the ranges the UI can request', () => {
        expect([...VALID_RANGES].sort()).toEqual([...SELECTOR_RANGES].sort());
    });

    it('both locales label every range', () => {
        for (const range of SELECTOR_RANGES) {
            expect(en.rangeLabels[range as keyof typeof en.rangeLabels]).toBeTruthy();
            expect(zhTW.rangeLabels[range as keyof typeof zhTW.rangeLabels]).toBeTruthy();
        }
    });

    // Two lists the checks above do not reach. Both fail SILENTLY: a range added to
    // PRESENT_RANGES but not to the parser's token table just loses its fast path and
    // falls through to the model, and the prompt's range clause is a hand-typed string
    // that can drift from PRESENT_RANGES with nothing comparing the two.
    const catalog: CatalogItem[] = [
        { symbol: '^HSI', name: '恒生指數', nameEn: 'Hang Seng Index', group: 'market' },
    ];

    it('the deterministic parser has a token for every range', () => {
        for (const range of PRESENT_RANGES) {
            expect(parseCommandDeterministic(range.toLowerCase(), catalog))
                .toEqual({ kind: 'range', symbols: [], range });
        }
    });

    it('the model prompt offers exactly the ranges the parser accepts', () => {
        const prompt = JSON.stringify(buildParsePrompt('anything', catalog, 'en'));
        expect(prompt).toContain(PRESENT_RANGES.join(','));
    });
});
