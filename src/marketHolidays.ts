/**
 * Exchange trading-holiday tables for the four markets in `marketHours.ts`.
 *
 * Scope: SCHEDULED closures only — published, calendar-known non-trading days and
 * shortened sessions. Unscheduled events (emergency halts, system outages, days of
 * national mourning) are out of scope and always will be; they cannot be tabulated
 * ahead of time.
 *
 * Type-only imports from `./marketHours` are erased at compile time, so the runtime
 * dependency runs one way: marketHours -> marketHolidays.
 *
 * ── UPDATING THIS FILE (it expires) ──────────────────────────────────────────
 * `coveredYears` bounds what these tables can answer. Once the last covered year
 * passes, `getMarketStatus` silently reverts to weekday-only behaviour — which is
 * exactly the holiday-blind bug this module exists to fix. `classifyHolidayCalendar`
 * in `src/preflight.ts` raises a go-live warning 60 days before that happens.
 *
 * To extend, take the dates from the exchanges themselves — never from a model and
 * never by extrapolating last year's dates. Lunar and astronomical holidays (Lunar
 * New Year, Ching Ming, Tuen Ng, Mid-Autumn, Chung Yeung, the Japanese equinoxes)
 * are not rule-derivable and MUST be read off the published calendar:
 *   US  NYSE   https://www.nyse.com/markets/hours-calendars
 *   HK  HKEX   https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market
 *   JP  JPX    https://www.jpx.co.jp/english/derivatives/rules/trading-hours/index.html
 *   EU  Xetra  https://www.xetra.com/xetra-en/trading/trading-calendar-and-trading-hours
 */

import type { MarketKey, MarketPhase } from './marketHours';

/** One phase transition, expressed as minutes past exchange-local midnight. */
export interface SessionBoundary {
  minute: number;
  phaseStartingHere: MarketPhase;
}

export interface HalfDay {
  name: string;
  /** Replaces the normal boundary table for this date only. */
  boundaries: SessionBoundary[];
}

export interface HolidayCalendar {
  /** ISO 'YYYY-MM-DD' (exchange-local date) -> display name. Market fully shut. */
  fullClosures: Record<string, string>;
  /** ISO 'YYYY-MM-DD' -> shortened session for that date. */
  halfDays: Record<string, HalfDay>;
  /** Years these tables actually describe. Outside these, lookups return null. */
  coveredYears: number[];
}

export type HolidayLookup =
  | { kind: 'full'; name: string }
  | { kind: 'half'; name: string; boundaries: SessionBoundary[] }
  | null;

/** Zero-padded ISO date key from exchange-local calendar parts. */
export function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Verified tables. Empty entries mean "no coverage" — the caller degrades to
 * weekday-only behaviour rather than inventing closures.
 */
export const HOLIDAY_CALENDARS: Record<MarketKey, HolidayCalendar> = {
  // HKEX publishes roughly one year ahead, so 2028 is not yet available.
  // Since 23 Sep 2024 HKEX trades through Typhoon Signal 8+ and Black Rainstorm
  // warnings (Severe Weather Trading), so weather is deliberately not modelled.
  // Note 2026-09-25 (Mid-Autumn Festival itself) is a FULL trading day — the
  // closure is the day after. 2027 has no Labour Day closure (1 May is a Saturday).
  HK: {
    fullClosures: {
      '2026-01-01': "New Year's Day",
      '2026-02-17': "Lunar New Year's Day",
      '2026-02-18': "Second day of Lunar New Year",
      '2026-02-19': "Third day of Lunar New Year",
      '2026-04-03': "Good Friday",
      '2026-04-06': "Day following Ching Ming Festival",
      '2026-04-07': "Day following Easter Monday",
      '2026-05-01': "Labour Day",
      '2026-05-25': "Day following Birthday of the Buddha",
      '2026-06-19': "Tuen Ng Festival",
      '2026-07-01': "HKSAR Establishment Day",
      '2026-10-01': "National Day",
      '2026-10-19': "Day following Chung Yeung Festival",
      '2026-12-25': "Christmas Day",
      '2027-01-01': "New Year's Day",
      '2027-02-08': "Third day of Lunar New Year",
      '2027-02-09': "Fourth day of Lunar New Year (substitute for Second day falling on Sunday)",
      '2027-03-26': "Good Friday",
      '2027-03-29': "Easter Monday",
      '2027-04-05': "Ching Ming Festival",
      '2027-05-13': "Birthday of the Buddha",
      '2027-06-09': "Tuen Ng Festival",
      '2027-07-01': "HKSAR Establishment Day",
      '2027-09-16': "Day following Chinese Mid-Autumn Festival",
      '2027-10-01': "National Day",
      '2027-10-08': "Chung Yeung Festival",
      '2027-12-27': "First weekday after Christmas Day",
    },
    halfDays: {
      '2026-02-16': { name: "Lunar New Year's Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
      '2026-12-24': { name: "Christmas Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
      '2026-12-31': { name: "New Year's Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
      '2027-02-05': { name: "Lunar New Year's Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
      '2027-12-24': { name: "Christmas Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
      '2027-12-31': { name: "New Year's Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 720, phaseStartingHere: 'closed' }] },
    },
    coveredYears: [2026, 2027],
  },
  // JPX publishes roughly one year ahead, so 2028 is not yet available.
  // Equinox days are astronomically fixed and are read off the published calendar,
  // never computed. Japan has no DST and JPX cash equities have no shortened sessions.
  JP: {
    fullClosures: {
      '2026-01-01': "New Year's Day",
      '2026-01-02': "Market Holiday (year-end/new-year)",
      '2026-01-12': "Coming of Age Day",
      '2026-02-11': "National Foundation Day",
      '2026-02-23': "Emperor's Birthday",
      '2026-03-20': "Vernal Equinox Day",
      '2026-04-29': "Showa Day",
      '2026-05-04': "Greenery Day",
      '2026-05-05': "Children's Day",
      '2026-05-06': "Constitution Memorial Day (May 3) observed",
      '2026-07-20': "Marine Day",
      '2026-08-11': "Mountain Day",
      '2026-09-21': "Respect for the Aged Day",
      '2026-09-22': "Holiday (Act on National Holidays, Rule 3 Para. 3)",
      '2026-09-23': "Autumnal Equinox Day",
      '2026-10-12': "Sports Day",
      '2026-11-03': "Culture Day",
      '2026-11-23': "Labor Thanksgiving Day",
      '2026-12-31': "Market Holiday (year-end)",
      '2027-01-01': "New Year's Day",
      '2027-01-11': "Coming of Age Day",
      '2027-02-11': "National Foundation Day",
      '2027-02-23': "Emperor's Birthday",
      '2027-03-22': "Vernal Equinox Day (Mar. 21) observed",
      '2027-04-29': "Showa Day",
      '2027-05-03': "Constitution Memorial Day",
      '2027-05-04': "Greenery Day",
      '2027-05-05': "Children's Day",
      '2027-07-19': "Marine Day",
      '2027-08-11': "Mountain Day",
      '2027-09-20': "Respect for the Aged Day",
      '2027-09-23': "Autumnal Equinox Day",
      '2027-10-11': "Sports Day",
      '2027-11-03': "Culture Day",
      '2027-11-23': "Labor Thanksgiving Day",
      '2027-12-31': "Market Holiday (year-end)",
    },
    halfDays: {},
    coveredYears: [2026, 2027],
  },
  // halfDays is deliberately empty. Xetra runs a shortened year-end session (around
  // 30 Dec), but the sourcing pass could not confirm its close time from a primary
  // source for any covered year, and an unverified boundary would be a guess. Full
  // closures below are independently confirmed. Note 24 and 31 Dec are FULL closures
  // (settlement only, no trading), and Whit Monday is NOT a Xetra closure.
  EU: {
    fullClosures: {
      '2026-01-01': "New Year's Day",
      '2026-04-03': "Good Friday",
      '2026-04-06': "Easter Monday",
      '2026-05-01': "Labour Day",
      '2026-12-24': "Christmas Eve (no trading; settlement open)",
      '2026-12-25': "Christmas Day",
      '2026-12-31': "New Year's Eve (no trading; settlement open)",
      '2027-01-01': "New Year's Day",
      '2027-03-26': "Good Friday",
      '2027-03-29': "Easter Monday",
      '2027-12-24': "Christmas Eve (no trading; settlement open)",
      '2027-12-31': "New Year's Eve (no trading; settlement open)",
      '2028-04-14': "Good Friday",
      '2028-04-17': "Easter Monday",
      '2028-05-01': "Labour Day",
      '2028-12-25': "Christmas Day",
      '2028-12-26': "Boxing Day",
    },
    halfDays: {},
    coveredYears: [2026, 2027, 2028],
  },
  // NYSE published 2026-2028 together, so all three years are primary-sourced.
  // Nasdaq observes the same cash-equity schedule. Jan 1 2028 falls on a Saturday
  // and NYSE observes NO New Year holiday for it, so 2028 has 9 closures, not 10.
  // SIFMA's bond-market calendar differs (adds Columbus Day, Veterans Day) and is
  // NOT modelled here — these tables describe cash equities only.
  US: {
    fullClosures: {
      '2026-01-01': "New Year's Day",
      '2026-01-19': "Martin Luther King, Jr. Day",
      '2026-02-16': "Washington's Birthday",
      '2026-04-03': "Good Friday",
      '2026-05-25': "Memorial Day",
      '2026-06-19': "Juneteenth National Independence Day",
      '2026-07-03': "Independence Day (observed)",
      '2026-09-07': "Labor Day",
      '2026-11-26': "Thanksgiving Day",
      '2026-12-25': "Christmas Day",
      '2027-01-01': "New Year's Day",
      '2027-01-18': "Martin Luther King, Jr. Day",
      '2027-02-15': "Washington's Birthday",
      '2027-03-26': "Good Friday",
      '2027-05-31': "Memorial Day",
      '2027-06-18': "Juneteenth National Independence Day (observed)",
      '2027-07-05': "Independence Day (observed)",
      '2027-09-06': "Labor Day",
      '2027-11-25': "Thanksgiving Day",
      '2027-12-24': "Christmas Day (observed)",
      '2028-01-17': "Martin Luther King, Jr. Day",
      '2028-02-21': "Washington's Birthday",
      '2028-04-14': "Good Friday",
      '2028-05-29': "Memorial Day",
      '2028-06-19': "Juneteenth National Independence Day",
      '2028-07-04': "Independence Day",
      '2028-09-04': "Labor Day",
      '2028-11-23': "Thanksgiving Day",
      '2028-12-25': "Christmas Day",
    },
    halfDays: {
      '2026-11-27': { name: "Day after Thanksgiving", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 780, phaseStartingHere: 'closed' }] },
      '2026-12-24': { name: "Christmas Eve", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 780, phaseStartingHere: 'closed' }] },
      '2027-11-26': { name: "Day after Thanksgiving", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 780, phaseStartingHere: 'closed' }] },
      '2028-07-03': { name: "Day before Independence Day", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 780, phaseStartingHere: 'closed' }] },
      '2028-11-24': { name: "Day after Thanksgiving", boundaries: [{ minute: 570, phaseStartingHere: 'open' }, { minute: 780, phaseStartingHere: 'closed' }] },
    },
    coveredYears: [2026, 2027, 2028],
  },
};

export function isCoveredYear(
  key: MarketKey,
  year: number,
  calendars: Record<MarketKey, HolidayCalendar> = HOLIDAY_CALENDARS,
): boolean {
  return calendars[key].coveredYears.includes(year);
}

/**
 * Look up a single exchange-local calendar date.
 *
 * Returns null when the date is not a scheduled non-trading day OR when its year
 * is outside `coveredYears` — the two are deliberately indistinguishable here, so
 * callers must consult `isCoveredYear` separately to know which case they are in.
 */
export function lookupHoliday(
  key: MarketKey,
  y: number,
  m: number,
  d: number,
  calendars: Record<MarketKey, HolidayCalendar> = HOLIDAY_CALENDARS,
): HolidayLookup {
  if (!isCoveredYear(key, y, calendars)) return null;
  const cal = calendars[key];
  const iso = isoDate(y, m, d);

  const full = cal.fullClosures[iso];
  if (typeof full === 'string') return { kind: 'full', name: full };

  const half = cal.halfDays[iso];
  if (half) {
    // A shortened session with no open phase is a closure that was mis-filed.
    // Treat it as a full closure rather than producing a day that never opens.
    const opens = half.boundaries.some((b) => b.phaseStartingHere === 'open');
    if (!opens) return { kind: 'full', name: half.name };
    return { kind: 'half', name: half.name, boundaries: half.boundaries };
  }

  return null;
}

/**
 * Last exchange-local date each market's table can answer, as epoch ms at the end
 * of that day (approximated in UTC — a few hours of slack is irrelevant against a
 * 60-day preflight warning window). Returns null for an uncovered market.
 */
export function calendarCoverageEnd(
  key: MarketKey,
  calendars: Record<MarketKey, HolidayCalendar> = HOLIDAY_CALENDARS,
): number | null {
  const years = calendars[key].coveredYears;
  if (years.length === 0) return null;
  return Date.UTC(Math.max(...years), 11, 31, 23, 59, 59, 999);
}
