/**
 * Pure module: reports whether a stock exchange is open.
 *
 * Public holidays are OUT OF SCOPE — this module does not model them.
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

export type MarketKey = 'HK' | 'US' | 'JP' | 'EU';
export type MarketPhase = 'open' | 'lunch' | 'closed';

export interface MarketStatus {
  key: MarketKey;
  phase: MarketPhase;
  /** Epoch ms of the next phase transition. */
  nextChangeAt: number;
}

interface SessionEntry {
  minute: number;
  phaseStartingHere: MarketPhase;
}

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

const SESSIONS: Record<MarketKey, { tz: string; boundaries: SessionEntry[] }> = {
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

// ── Public API ───────────────────────────────────────────────────────────────

export function getMarketStatus(key: MarketKey, now: Date): MarketStatus {
  const { tz, boundaries } = SESSIONS[key];
  const wc = wallClock(tz, now);
  const nowMs = now.getTime();

  let phase: MarketPhase;
  let nextChangeAt: number;

  if (wc.weekday === 0 || wc.weekday === 6) {
    // Weekend — closed; find next Monday's first boundary.
    phase = 'closed';
    nextChangeAt = findNextOpen(tz, boundaries, wc, nowMs);
  } else {
    // Weekday — find current phase.
    phase = 'closed';
    for (const b of boundaries) {
      if (b.minute <= wc.minutes) {
        phase = b.phaseStartingHere;
      }
    }
    // Find next transition.
    const nextB = boundaries.find((b) => b.minute > wc.minutes);
    if (nextB) {
      nextChangeAt = epochFor(tz, wc.y, wc.m, wc.d, nextB.minute);
    } else {
      // After last boundary today → next open on a future non-weekend day.
      nextChangeAt = findNextOpen(tz, boundaries, wc, nowMs);
    }
  }

  return { key, phase, nextChangeAt };
}

export function getAllMarketStatuses(now: Date): MarketStatus[] {
  return MARKET_ORDER.map((k) => getMarketStatus(k, now));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNextOpen(
  tz: string,
  boundaries: SessionEntry[],
  wc: { y: number; m: number; d: number; weekday: number; minutes: number },
  nowMs: number,
): number {
  const firstBoundary = boundaries[0]; // always the earliest open
  // Scan forward day by day (max 7 iterations).
  // Use wallClock on nowEpoch + k*86400000 to get each following day's y/m/d;
  // DST 23/25-hour days are safe because we only need the calendar date, and
  // a ±1h drift never skips a calendar day at the times involved.
  for (let k = 1; k <= 7; k++) {
    const futureWc = wallClock(tz, new Date(nowMs + k * 86_400_000));
    if (futureWc.weekday !== 0 && futureWc.weekday !== 6) {
      return epochFor(tz, futureWc.y, futureWc.m, futureWc.d, firstBoundary.minute);
    }
  }
  // Fallback (should not happen within 7 days).
  return epochFor(tz, wc.y, wc.m, wc.d + 7, firstBoundary.minute);
}
