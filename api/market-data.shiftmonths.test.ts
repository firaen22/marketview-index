import { describe, it, expect } from 'vitest';
import { shiftMonths } from './market-data.js';

const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('shiftMonths', () => {
    it('clamps to the last day of a shorter target month instead of overflowing', () => {
        // setMonth() alone: Mar 31 − 1M → "Feb 31" → Mar 3, a 28-day "1M" window.
        expect(ymd(shiftMonths(new Date(2026, 2, 31), -1))).toEqual([2026, 2, 28]);
        expect(ymd(shiftMonths(new Date(2026, 9, 31), -1))).toEqual([2026, 9, 30]);
        expect(ymd(shiftMonths(new Date(2026, 4, 31), -3))).toEqual([2026, 2, 28]);
        expect(ymd(shiftMonths(new Date(2026, 2, 31), -6))).toEqual([2025, 9, 30]);
        expect(ymd(shiftMonths(new Date(2024, 1, 29), -12))).toEqual([2023, 2, 28]);
    });

    it('keeps the day when the target month has it, across year boundaries', () => {
        expect(ymd(shiftMonths(new Date(2026, 0, 15), -1))).toEqual([2025, 12, 15]);
        expect(ymd(shiftMonths(new Date(2028, 1, 29), -48))).toEqual([2024, 2, 29]);
        expect(ymd(shiftMonths(new Date(2026, 6, 31), -60))).toEqual([2021, 7, 31]);
    });

    it('counts leap years correctly for years 0-99', () => {
        // new Date(y, m, d) maps y 0-99 to 1900+y, so year 0 (leap) would read as 1900 (not leap).
        const marchEnd = new Date(2026, 2, 31);
        marchEnd.setFullYear(0);
        expect(ymd(shiftMonths(marchEnd, -1))).toEqual([0, 2, 29]);
    });

    it('returns a new date and leaves the input untouched', () => {
        const input = new Date(2026, 2, 31, 9, 30);
        const out = shiftMonths(input, -1);
        expect(out).not.toBe(input);
        expect(ymd(input)).toEqual([2026, 3, 31]);
        expect([out.getHours(), out.getMinutes()]).toEqual([9, 30]);
    });
});
