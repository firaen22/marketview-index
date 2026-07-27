import { describe, it, expect } from 'vitest';
import { getMarketStatus, getAllMarketStatuses, type MarketKey } from './marketHours';
import { HOLIDAY_CALENDARS, lookupHoliday, isCoveredYear, type HolidayCalendar } from './marketHolidays';

/**
 * Holiday-aware session tests.
 *
 * Every expected epoch below was computed independently with Python's zoneinfo
 * (a different tz implementation from the Intl-based one under test), not by
 * running this code and copying its output.
 *
 * Holiday dates come from the exchanges' own published calendars — see the source
 * URLs in marketHolidays.ts. They are NOT rule-derived and must not be "corrected"
 * to fit a pattern.
 */

const MARKETS: MarketKey[] = ['HK', 'JP', 'EU', 'US'];

// ── Table integrity: the standing gate over the hand-maintained data ─────────

describe('HOLIDAY_CALENDARS table integrity', () => {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  for (const key of MARKETS) {
    const cal = HOLIDAY_CALENDARS[key];
    const allDates = [...Object.keys(cal.fullClosures), ...Object.keys(cal.halfDays)];

    it(`${key}: declares at least one covered year`, () => {
      expect(cal.coveredYears.length).toBeGreaterThan(0);
    });

    it(`${key}: every date is a well-formed ISO date that round-trips`, () => {
      for (const iso of allDates) {
        expect(iso, iso).toMatch(ISO);
        const [y, m, d] = iso.split('-').map(Number);
        const parsed = new Date(Date.UTC(y, m - 1, d));
        // Catches impossible dates like 2026-02-30 silently rolling into March.
        expect(parsed.getUTCFullYear(), iso).toBe(y);
        expect(parsed.getUTCMonth() + 1, iso).toBe(m);
        expect(parsed.getUTCDate(), iso).toBe(d);
      }
    });

    it(`${key}: no entry falls on a weekend (weekends are already non-trading)`, () => {
      for (const iso of allDates) {
        const [y, m, d] = iso.split('-').map(Number);
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        expect(dow, `${iso} is a weekend day`).not.toBe(0);
        expect(dow, `${iso} is a weekend day`).not.toBe(6);
      }
    });

    it(`${key}: every entry's year is declared in coveredYears`, () => {
      for (const iso of allDates) {
        expect(cal.coveredYears, iso).toContain(Number(iso.slice(0, 4)));
      }
    });

    it(`${key}: no date is both a full closure and a half day`, () => {
      const dupes = Object.keys(cal.halfDays).filter((d) => d in cal.fullClosures);
      expect(dupes).toEqual([]);
    });

    it(`${key}: every half day actually opens, with ascending boundaries`, () => {
      for (const [iso, hd] of Object.entries(cal.halfDays)) {
        expect(hd.boundaries.some((b) => b.phaseStartingHere === 'open'), iso).toBe(true);
        const minutes = hd.boundaries.map((b) => b.minute);
        expect(minutes, iso).toEqual([...minutes].sort((a, b) => a - b));
        for (const m of minutes) {
          expect(m, iso).toBeGreaterThanOrEqual(0);
          expect(m, iso).toBeLessThan(24 * 60);
        }
      }
    });
  }
});

// ── Real published closures ──────────────────────────────────────────────────

describe('scheduled full closures', () => {
  it('US: Christmas Day 2026 (Fri) is a holiday, next open is Monday', () => {
    const s = getMarketStatus('US', new Date(1798210800000)); // 2026-12-25 10:00 ET
    expect(s.phase).toBe('holiday');
    expect(s.holidayName).toBe('Christmas Day');
    expect(s.calendarCoverage).toBe('covered');
    expect(s.nextChangeAt).toBe(1798468200000); // 2026-12-28 09:30 ET
  });

  it('EU: Good Friday 2026 is a holiday even though it is a weekday', () => {
    // 2026-04-03 10:00 CEST
    const s = getMarketStatus('EU', new Date(Date.UTC(2026, 3, 3, 8, 0)));
    expect(s.phase).toBe('holiday');
    expect(s.holidayName).toBe('Good Friday');
  });

  it('JP: Greenery Day 2026 is a holiday', () => {
    // 2026-05-04 10:00 JST
    const s = getMarketStatus('JP', new Date(Date.UTC(2026, 4, 4, 1, 0)));
    expect(s.phase).toBe('holiday');
  });

  it('HK: Mid-Autumn Festival day 2026 itself still TRADES (the closure is the day after)', () => {
    // 2026-09-25 10:00 HKT — a real trap: the festival day is a full trading day.
    const s = getMarketStatus('HK', new Date(Date.UTC(2026, 8, 25, 2, 0)));
    expect(s.phase).toBe('open');
    expect(s.holidayName).toBeUndefined();
  });
});

// ── Shortened sessions ───────────────────────────────────────────────────────

describe('half days', () => {
  it('HK: Lunar New Year Eve 2026 trades the morning only', () => {
    const during = getMarketStatus('HK', new Date(1771210800000)); // 11:00 HKT
    expect(during.phase).toBe('open');
    expect(during.holidayName).toBe("Lunar New Year's Eve");
    expect(during.nextChangeAt).toBe(1771214400000); // 12:00 HKT, not the usual 12:00 lunch->13:00

    const after = getMarketStatus('HK', new Date(1771216200000)); // 12:30 HKT
    expect(after.phase).toBe('closed');
    // Feb 17/18/19 are Lunar New Year closures, so the next open is Fri Feb 20.
    expect(after.nextChangeAt).toBe(1771551000000);
  });

  it('US: day after Thanksgiving 2026 closes at 13:00 ET', () => {
    const during = getMarketStatus('US', new Date(1795798800000)); // 12:00 ET
    expect(during.phase).toBe('open');
    expect(during.nextChangeAt).toBe(1795802400000); // 13:00 ET

    const after = getMarketStatus('US', new Date(1795804200000)); // 13:30 ET
    expect(after.phase).toBe('closed');
    expect(after.nextChangeAt).toBe(1796049000000); // Mon 2026-11-30 09:30 ET
  });
});

// ── Coverage boundary ────────────────────────────────────────────────────────

describe('calendar coverage', () => {
  it('reports uncovered and degrades to weekday-only past the table horizon', () => {
    // 2035-12-25 is a Tuesday and a real Christmas, but no table covers 2035.
    const s = getMarketStatus('US', new Date(Date.UTC(2035, 11, 25, 15, 0)));
    expect(s.calendarCoverage).toBe('uncovered');
    expect(s.phase).not.toBe('holiday');
    expect(s.holidayName).toBeUndefined();
    expect(s.nextChangeAt).toBeGreaterThan(Date.UTC(2035, 11, 25, 15, 0));
  });

  it('lookupHoliday returns null for a real holiday in an uncovered year', () => {
    expect(lookupHoliday('US', 2035, 12, 25)).toBeNull();
    expect(isCoveredYear('US', 2035)).toBe(false);
  });

  it('every market still yields a strictly future nextChangeAt across covered and uncovered years', () => {
    const instants = [
      Date.UTC(2026, 0, 1, 3, 0),
      Date.UTC(2026, 1, 17, 4, 0),   // HK Lunar New Year
      Date.UTC(2026, 11, 25, 15, 0), // US Christmas
      Date.UTC(2027, 4, 4, 1, 0),    // JP Golden Week
      Date.UTC(2027, 11, 31, 12, 0), // year boundary, last covered year for HK/JP
      Date.UTC(2029, 5, 15, 9, 0),   // fully uncovered
    ];
    for (const t of instants) {
      for (const s of getAllMarketStatuses(new Date(t))) {
        expect(s.nextChangeAt, `${s.key} @ ${new Date(t).toISOString()}`).toBeGreaterThan(t);
      }
    }
  });
});

// ── Synthetic edges (injected fixtures) ──────────────────────────────────────

function fixture(cal: Partial<HolidayCalendar>): Record<MarketKey, HolidayCalendar> {
  const base: HolidayCalendar = { fullClosures: {}, halfDays: {}, coveredYears: [2026], ...cal };
  return { HK: base, JP: base, EU: base, US: base };
}

describe('synthetic edge cases', () => {
  it('a holiday falling on a Saturday is not double-counted', () => {
    // 2026-07-04 is a Saturday. Asking on that Saturday must report a plain
    // weekend close and must not skip an extra week.
    const cals = fixture({ fullClosures: { '2026-07-04': 'Fake Saturday Holiday' } });
    const s = getMarketStatus('US', new Date(Date.UTC(2026, 6, 4, 15, 0)), cals);
    expect(s.phase).toBe('closed');
    expect(s.holidayName).toBeUndefined();
    // Next open is Monday 2026-07-06 09:30 EDT = 13:30 UTC.
    expect(s.nextChangeAt).toBe(Date.UTC(2026, 6, 6, 13, 30));
  });

  it('a half day with no open boundary is treated as a full closure', () => {
    const cals = fixture({
      halfDays: {
        '2026-07-07': { name: 'Malformed', boundaries: [{ minute: 570, phaseStartingHere: 'closed' }] },
      },
    });
    const s = getMarketStatus('US', new Date(Date.UTC(2026, 6, 7, 15, 0))); // Tue
    expect(s.phase).toBe('open'); // sanity: normally open
    const t = getMarketStatus('US', new Date(Date.UTC(2026, 6, 7, 15, 0)), cals);
    expect(t.phase).toBe('holiday');
    expect(t.holidayName).toBe('Malformed');
  });

  it('skips a long consecutive closure run to find the next trading day', () => {
    const runDays = ['06', '07', '08', '09', '10', '13', '14', '15', '16', '17'];
    const cals = fixture({
      fullClosures: Object.fromEntries(runDays.map((d) => [`2026-07-${d}`, `Long closure ${d}`])),
    });
    // Friday 2026-07-03 after the close; the next 10 weekdays are all shut.
    const s = getMarketStatus('US', new Date(Date.UTC(2026, 6, 3, 21, 0)), cals);
    expect(s.phase).toBe('closed');
    // First open weekday is Saturday-skipping Mon 2026-07-20 09:30 EDT.
    expect(s.nextChangeAt).toBe(Date.UTC(2026, 6, 20, 13, 30));
  });

  it('preserves the RangeError contract for invalid dates', () => {
    expect(() => getMarketStatus('HK', new Date(NaN))).toThrow(RangeError);
    expect(() => getAllMarketStatuses(new Date(NaN))).toThrow('Invalid Date');
  });
});
