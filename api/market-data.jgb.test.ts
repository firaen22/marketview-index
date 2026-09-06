import { describe, it, expect } from 'vitest';
import { parseJgbDate, parseJgbCsv, findJgbTenorColumn } from './market-data.js';

// Shape of the Ministry of Finance CSV, ASCII rows only (the real file is
// Shift-JIS but every data row is ASCII).
const CSV = [
    '国債金利情報 (令和8年9月),,,,,,,,,,,,,,,(単位 : %)',
    '基準日,1年,2年,3年,4年,5年,6年,7年,8年,9年,10年,15年,20年,25年,30年,40年',
    'R8.9.1,1.527,1.802,1.952,2.14,2.28,2.411,2.559,2.718,2.848,2.987,3.544,3.859,4.143,4.131,4.145',
    'R8.9.2,1.56,1.854,2.009,2.199,2.332,2.45,2.585,2.743,2.874,3.006,3.554,3.864,4.141,4.122,4.134',
    'S49.9.24,10.327,9.362,8.83,8.515,8.348,8.29,8.24,8.121,8.127,-,-,-,-,-,-',
    ',,,,,,,,,,,,,,,',
    'note row that is not data,,,,,,,,,,,,,,,',
].join('\r\n');

describe('parseJgbDate', () => {
    it('converts Reiwa era dates to UTC dates', () => {
        expect(parseJgbDate('R8.9.1')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('converts Heisei and Showa era dates', () => {
        expect(parseJgbDate('H1.1.5')?.toISOString()).toBe('1989-01-05T00:00:00.000Z');
        expect(parseJgbDate('S49.9.24')?.toISOString()).toBe('1974-09-24T00:00:00.000Z');
    });

    it('rejects anything that is not an era date', () => {
        for (const raw of ['', '基準日', '2026-09-01', 'X8.9.1', 'R8.13.1', 'R8.9']) {
            expect(parseJgbDate(raw)).toBeNull();
        }
    });
});

describe('parseJgbCsv', () => {
    it('reads the requested tenor column, oldest rows included', () => {
        const points = parseJgbCsv(CSV, 10);
        expect(points.map(p => p.close)).toEqual([2.987, 3.006]);
        expect(points[0].date.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('drops rows whose rate is "-" (no reference that day)', () => {
        // S49 has "-" in the 10Y column and must not appear above; it does
        // appear for a tenor it actually quotes.
        const nineYear = parseJgbCsv(CSV, 9);
        expect(nineYear).toHaveLength(3);
        expect(nineYear[2].close).toBe(8.127);
    });

    it('reads a long tenor without confusing it with a shorter one', () => {
        expect(parseJgbCsv(CSV, 30).map(p => p.close)).toEqual([4.131, 4.122]);
    });

    it('finds the tenor column when the kanji is mangled by a latin1 read', () => {
        // The real file is Shift-JIS read as latin1, so "10年" arrives as
        // "10\x94N". Only the digits are matched, so the column still resolves.
        const mangled = CSV.split('\r\n')
            .map(line => line.replace(/(\d+)年/g, '$1\x94N'))
            .join('\r\n');
        expect(parseJgbCsv(mangled, 10).map(p => p.close)).toEqual([2.987, 3.006]);
    });

    it('never reads the date column as a tenor', () => {
        expect(findJgbTenorColumn('基準日,1年,2年,10年', 10)).toBe(3);
        expect(findJgbTenorColumn('R8.9.1,1.5,1.8,2.9', 10)).toBe(-1);
    });

    it('returns [] when the tenor column is absent', () => {
        expect(parseJgbCsv(CSV, 50)).toEqual([]);
        expect(parseJgbCsv('', 10)).toEqual([]);
    });
});
