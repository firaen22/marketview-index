/**
 * Pure module: reports whether a stock exchange is open.
 *
 * Scheduled public holidays and shortened sessions ARE modelled, via the tables in
 * `./marketHolidays`. Unscheduled halts (emergency closures, system outages, days of
 * mourning) are not, and cannot be — they are unknowable ahead of time.
 *
 * Session table (all times are local exchange wall-clock time; weekend = Sat+Sun):
 *
 *   HK: Asia/Hong_Kong
 *     09:30–12:00 (open), 12:00–13:00 (lunch), 13:00–16:00 (open), 16:00–next day (closed)
 *   JP: Asia/Tokyo
 *     09:00–11:30 (open), 11:30–12:30 (lunch), 12:30–15:30 (open), 15:30–next day (closed)
 *   EU: Europe/Berlin (Xetra)
 *     09:00–17:30 (open), 17:30–next day (closed)
 *   US: America/New_York (NYSE)
 *     09:30–16:00 (open), 16:00–next day (closed)
 */

import {
  HOLIDAY_CALENDARS,
  isCoveredYear,
  lookupHoliday,
  type HolidayCalendar,
  type SessionBoundary,
} from './marketHolidays';

export type MarketKey = 'HK' | 'US' | 'JP' | 'EU';
export type MarketPhase = 'open' | 'lunch' | 'closed' | 'holiday';

export interface MarketStatus {
  key: MarketKey;
  phase: MarketPhase;
  /** Epoch ms of the next phase transition. */
  nextChangeAt: number;
  /**
   * Name of the scheduled closure or shortened session in effect today, if any.
   * English only — deliberately NOT rendered on the bilingual projector chip; it
   * exists for preflight output and debugging.
   */
  holidayName?: string;
  /**
   * Whether the holiday table actually covers this date's year. `uncovered` means
   * the phase was derived from weekday rules alone and may be wrong on a holiday.
   */
  calendarCoverage: 'covered' | 'uncovered';
}

/**
 * How far ahead to look for the next trading day. The longest real scheduled
 * closure across these four exchanges is 10 calendar days (Tokyo, Golden Week
 * 2019, extended by the imperial transition), so 20 leaves genuine headroom.
 */
const MAX_SCAN_DAYS = 20;

// ── Formatters cache ─────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

// ── wallClock ────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function wallClock(
  tz: string,
  at: Date,
): { y: number; m: number; d: number; weekday: number; minutes: number } {
  if (!Number.isFinite(at.getTime())) throw new RangeError('Invalid Date');
  const parts = getFormatter(tz).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const y = parseInt(get('year'), 10);
  const m = parseInt(get('month'), 10);
  const d = parseInt(get('day'), 10);
  const weekday = WEEKDAY_MAP[get('weekday')];
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  return { y, m, d, weekday, minutes: hour * 60 + minute };
}

// ── epochFor ─────────────────────────────────────────────────────────────────

/**
 * Convert a zone-local wall time to epoch ms.
 *
 * For wall times inside a DST spring-forward gap this returns a best-effort
 * nearby instant — acceptable because no session boundary in the table falls
 * in a gap for these zones.
 */
function epochFor(
  tz: string,
  y: number,
  m: number,
  d: number,
  minutes: number,
): number {
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = guess - wallClockToUtcMs(tz, guess);
  const candidate = guess + off1;
  const off2 = candidate - wallClockToUtcMs(tz, candidate);
  return guess + off2;
}

/** Re-read the wall clock of an epoch instant in `tz` and re-encode as UTC epoch. */
function wallClockToUtcMs(tz: string, epoch: number): number {
  const dt = new Date(epoch);
  const parts = getFormatter(tz).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    parseInt(get('hour'), 10),
    parseInt(get('minute'), 10),
  );
}

// ── Session table ────────────────────────────────────────────────────────────

const SESSIONS: Record<MarketKey, { tz: string; boundaries: SessionBoundary[] }> = {
  HK: {
    tz: 'Asia/Hong_Kong',
    boundaries: [
      { minute: 570, phaseStartingHere: 'open' },   // 09:30
      { minute: 720, phaseStartingHere: 'lunch' },   // 12:00
      { minute: 780, phaseStartingHere: 'open' },    // 13:00
      { minute: 960, phaseStartingHere: 'closed' },  // 16:00
    ],
  },
  JP: {
    tz: 'Asia/Tokyo',
    boundaries: [
      { minute: 540, phaseStartingHere: 'open' },    // 09:00
      { minute: 690, phaseStartingHere: 'lunch' },   // 11:30
      { minute: 750, phaseStartingHere: 'open' },    // 12:30
      { minute: 930, phaseStartingHere: 'closed' },  // 15:30
    ],
  },
  EU: {
    tz: 'Europe/Berlin',
    boundaries: [
      { minute: 540, phaseStartingHere: 'open' },    // 09:00
      { minute: 1050, phaseStartingHere: 'closed' }, // 17:30
    ],
  },
  US: {
    tz: 'America/New_York',
    boundaries: [
      { minute: 570, phaseStartingHere: 'open' },    // 09:30
      { minute: 960, phaseStartingHere: 'closed' },  // 16:00
    ],
  },
};

const MARKET_ORDER: MarketKey[] = ['HK', 'JP', 'EU', 'US'];

// ── Calendar arithmetic ──────────────────────────────────────────────────────

/**
 * Step a calendar date by whole days, with month/year rollover.
 *
 * Deliberately calendar arithmetic rather than adding 86_400_000 ms to an epoch:
 * on a spring-forward day a 24h jump from a late-evening wall time lands two
 * calendar days later, silently skipping one. That skipped day is always the DST
 * transition Sunday (harmless here), but the scan below must not depend on that
 * happening to be a weekend — stepping the date directly removes DST from the
 * loop entirely. Date.UTC normalises out-of-range day numbers for us.
 */
function addCalendarDays(
  y: number,
  m: number,
  d: number,
  n: number,
): { y: number; m: number; d: number; weekday: number } {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    weekday: t.getUTCDay(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getMarketStatus(
  key: MarketKey,
  now: Date,
  calendars: Record<MarketKey, HolidayCalendar> = HOLIDAY_CALENDARS,
): MarketStatus {
  const { tz, boundaries: normalBoundaries } = SESSIONS[key];
  const wc = wallClock(tz, now);
  const nowMs = now.getTime();

  // Coverage is judged in the EXCHANGE-LOCAL year — near midnight the UTC year
  // and the local year can differ.
  const calendarCoverage = isCoveredYear(key, wc.y, calendars) ? 'covered' : 'uncovered';
  const isWeekend = wc.weekday === 0 || wc.weekday === 6;

  // A holiday landing on a weekend must not be counted twice: the weekend branch
  // already reports closed, and the forward scan skips weekends on its own.
  const today = isWeekend ? null : lookupHoliday(key, wc.y, wc.m, wc.d, calendars);

  let phase: MarketPhase;
  let holidayName: string | undefined;
  let nextChangeAt: number;

  if (isWeekend) {
    phase = 'closed';
    nextChangeAt = findNextOpen(key, tz, normalBoundaries, wc, nowMs, calendars);
  } else if (today?.kind === 'full') {
    phase = 'holiday';
    holidayName = today.name;
    nextChangeAt = findNextOpen(key, tz, normalBoundaries, wc, nowMs, calendars);
  } else {
    // Normal weekday, or a shortened session that replaces today's boundaries.
    const todays = today?.kind === 'half' ? today.boundaries : normalBoundaries;
    holidayName = today?.kind === 'half' ? today.name : undefined;

    phase = 'closed';
    for (const b of todays) {
      if (b.minute <= wc.minutes) {
        phase = b.phaseStartingHere;
      }
    }
    const nextB = todays.find((b) => b.minute > wc.minutes);
    nextChangeAt = nextB
      ? epochFor(tz, wc.y, wc.m, wc.d, nextB.minute)
      : findNextOpen(key, tz, normalBoundaries, wc, nowMs, calendars);
  }

  return holidayName === undefined
    ? { key, phase, nextChangeAt, calendarCoverage }
    : { key, phase, nextChangeAt, holidayName, calendarCoverage };
}

export function getAllMarketStatuses(
  now: Date,
  calendars: Record<MarketKey, HolidayCalendar> = HOLIDAY_CALENDARS,
): MarketStatus[] {
  return MARKET_ORDER.map((k) => getMarketStatus(k, now, calendars));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Earliest boundary that actually opens the market, for a given day's table. */
function firstOpenBoundary(boundaries: SessionBoundary[]): SessionBoundary | undefined {
  return boundaries.find((b) => b.phaseStartingHere === 'open');
}

/**
 * Epoch ms of the next session open strictly after `nowMs`, skipping weekends and
 * scheduled closures and honouring a shortened session's own opening time.
 *
 * Degrades rather than throws: if the holiday-aware scan finds nothing within
 * MAX_SCAN_DAYS (only reachable via a malformed table), it retries ignoring
 * holidays. A wrong countdown is survivable on a projector; an exception thrown
 * during render is not.
 */
function findNextOpen(
  key: MarketKey,
  tz: string,
  normalBoundaries: SessionBoundary[],
  wc: { y: number; m: number; d: number; weekday: number; minutes: number },
  nowMs: number,
  calendars: Record<MarketKey, HolidayCalendar>,
): number {
  for (const respectHolidays of [true, false]) {
    for (let k = 1; k <= MAX_SCAN_DAYS; k++) {
      const day = addCalendarDays(wc.y, wc.m, wc.d, k);
      if (day.weekday === 0 || day.weekday === 6) continue;

      let boundaries = normalBoundaries;
      if (respectHolidays) {
        const h = lookupHoliday(key, day.y, day.m, day.d, calendars);
        if (h?.kind === 'full') continue;
        if (h?.kind === 'half') boundaries = h.boundaries;
      }

      const open = firstOpenBoundary(boundaries);
      if (!open) continue;

      const candidate = epochFor(tz, day.y, day.m, day.d, open.minute);
      if (candidate > nowMs) return candidate;
    }
  }

  // Unreachable with any sane session table; keeps the return type total.
  const fallback = addCalendarDays(wc.y, wc.m, wc.d, 7);
  return epochFor(tz, fallback.y, fallback.m, fallback.d, normalBoundaries[0].minute);
}
