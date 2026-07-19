import { describe, it, expect } from 'vitest';
import { VALID_RANGES } from '../api/market-data';
import { PRESENT_RANGES } from '../lib/presentCommand';
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
});
