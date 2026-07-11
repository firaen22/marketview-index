import { describe, it, expect } from 'vitest';
import { getMarketStatus, getAllMarketStatuses } from './marketHours';

/**
 * All frozen instants are expressed via Date.UTC (or ISO-Z) so tests pass
 * on a machine in any timezone.
 */

// Helper for readable UTC epoch literals.
const utc = Date.UTC;

describe('getMarketStatus', () => {
  // ── Weekend → closed, nextChangeAt = Monday open ──────────────────────

  it('Saturday → closed, next open is Monday', () => {
    // 2026-07-11 (Sat) 12:00 HKT
    const now = new Date(utc(2026, 6, 11, 4, 0));
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('closed');
    // Monday 2026-07-13 09:30 HKT = 01:30 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 6, 13, 1, 30));
  });

  it('Sunday → closed, next open is Monday', () => {
    // 2026-07-12 (Sun) 12:00 JST
    const now = new Date(utc(2026, 6, 12, 3, 0));
    const s = getMarketStatus('JP', now);
    expect(s.phase).toBe('closed');
    // Monday 2026-07-13 09:00 JST = 00:00 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 6, 13, 0, 0));
  });

  // ── Friday after close → next open is Monday (skip weekend) ───────────

  it('Friday 16:05 EST (US) → closed, next open Monday', () => {
    const now = new Date(utc(2026, 6, 10, 20, 5)); // 16:05 EDT
    const s = getMarketStatus('US', now);
    expect(s.phase).toBe('closed');
    // Monday 2026-07-13 09:30 EDT = 13:30 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 6, 13, 13, 30));
  });

  // ── Boundary inclusivity: [start, end) ────────────────────────────────

  it('HK 09:30:00 exactly → open', () => {
    const now = new Date(utc(2026, 6, 10, 1, 30)); // Wed 09:30 HKT
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('open');
  });

  it('HK 16:00:00 exactly → closed', () => {
    const now = new Date(utc(2026, 6, 10, 8, 0)); // Wed 16:00 HKT
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('closed');
  });

  it('HK 12:00:00 exactly → lunch', () => {
    const now = new Date(utc(2026, 6, 10, 4, 0)); // Wed 12:00 HKT
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('lunch');
  });

  it('HK 13:00:00 exactly → open (lunch end)', () => {
    const now = new Date(utc(2026, 6, 10, 5, 0)); // Wed 13:00 HKT
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('open');
  });

  // ── Seconds within a minute ───────────────────────────────────────────

  it('HK 09:29:59 → closed', () => {
    const now = new Date(utc(2026, 6, 10, 1, 29, 59));
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('closed');
  });

  it('HK 09:30:59 → open', () => {
    const now = new Date(utc(2026, 6, 10, 1, 30, 59));
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('open');
  });

  // ── US DST ────────────────────────────────────────────────────────────

  it('US winter 2026-01-15T14:35:00Z → 09:35 EST → open', () => {
    const now = new Date(utc(2026, 0, 15, 14, 35));
    const s = getMarketStatus('US', now);
    expect(s.phase).toBe('open');
    // nextChangeAt = 2026-01-15 16:00 EST = 21:00 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 0, 15, 21, 0));
  });

  it('US summer 2026-07-15T13:00:00Z → 09:00 EDT → closed', () => {
    const now = new Date(utc(2026, 6, 15, 13, 0));
    const s = getMarketStatus('US', now);
    expect(s.phase).toBe('closed');
    // Opens 09:30 EDT = 13:30 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 6, 15, 13, 30));
  });

  // ── HK lunch ──────────────────────────────────────────────────────────

  it('HK 2026-07-15T04:30:00Z = 12:30 HKT → lunch', () => {
    const now = new Date(utc(2026, 6, 15, 4, 30));
    const s = getMarketStatus('HK', now);
    expect(s.phase).toBe('lunch');
    // nextChangeAt = 13:00 HKT = 05:00 UTC
    expect(s.nextChangeAt).toBe(utc(2026, 6, 15, 5, 0));
  });

  // ── JP afternoon close ────────────────────────────────────────────────

  it('JP 2026-07-15T06:20:00Z = 15:20 JST → open', () => {
    const now = new Date(utc(2026, 6, 15, 6, 20));
    const s = getMarketStatus('JP', now);
    expect(s.phase).toBe('open');
  });

  it('JP 2026-07-15T06:30:00Z = 15:30 JST → closed', () => {
    const now = new Date(utc(2026, 6, 15, 6, 30));
    const s = getMarketStatus('JP', now);
    expect(s.phase).toBe('closed');
  });

  // ── EU basic ──────────────────────────────────────────────────────────

  it('EU weekday during session → open', () => {
    // 2026-07-15 12:00 CEST = 10:00 UTC
    const now = new Date(utc(2026, 6, 15, 10, 0));
    const s = getMarketStatus('EU', now);
    expect(s.phase).toBe('open');
  });

  // ── nextChangeAt always > now.getTime() ───────────────────────────────

  it('nextChangeAt is always strictly greater than now.getTime() for every valid test instant', () => {
    const instants: Date[] = [
      new Date(utc(2026, 6, 11, 4, 0)),   // HK Sat
      new Date(utc(2026, 6, 12, 3, 0)),   // JP Sun
      new Date(utc(2026, 6, 10, 20, 5)),  // US Fri after close
      new Date(utc(2026, 6, 10, 1, 30)),  // HK open boundary
      new Date(utc(2026, 6, 10, 8, 0)),   // HK closed boundary
      new Date(utc(2026, 6, 10, 4, 0)),   // HK lunch boundary
      new Date(utc(2026, 6, 10, 5, 0)),   // HK open boundary (lunch end)
      new Date(utc(2026, 6, 10, 1, 29, 59)),
      new Date(utc(2026, 6, 10, 1, 30, 59)),
      new Date(utc(2026, 0, 15, 14, 35)),
      new Date(utc(2026, 6, 15, 13, 0)),
      new Date(utc(2026, 6, 15, 4, 30)),
      new Date(utc(2026, 6, 15, 6, 20)),
      new Date(utc(2026, 6, 15, 6, 30)),
      new Date(utc(2026, 6, 15, 10, 0)),
    ];
    for (const now of instants) {
      for (const key of ['HK', 'US', 'JP', 'EU'] as const) {
        const s = getMarketStatus(key, now);
        expect(s.nextChangeAt).toBeGreaterThan(now.getTime());
      }
    }
  });
});

describe('getAllMarketStatuses', () => {
  it('returns exactly 4 entries in order HK, JP, EU, US', () => {
    const now = new Date(utc(2026, 6, 15, 4, 0)); // weekday
    const all = getAllMarketStatuses(now);
    expect(all).toHaveLength(4);
    expect(all.map((s) => s.key)).toEqual(['HK', 'JP', 'EU', 'US']);
  });

  it('propagates RangeError for invalid Date (NaN)', () => {
    expect(() => getAllMarketStatuses(new Date(NaN))).toThrow(RangeError);
    expect(() => getAllMarketStatuses(new Date(NaN))).toThrow('Invalid Date');
  });
});

describe('Invalid Date (NaN)', () => {
  it('getMarketStatus throws RangeError("Invalid Date")', () => {
    try {
      getMarketStatus('HK', new Date(NaN));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(RangeError);
      expect(e.message).toBe('Invalid Date');
    }
  });
});
