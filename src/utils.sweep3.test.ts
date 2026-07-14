import { describe, it, expect } from 'vitest';
import { formatSigned, ytdComparator } from './utils';

describe('formatSigned', () => {
  it('formats positive number with default digits', () => {
    expect(formatSigned(1.5)).toBe('+1.50');
  });
  it('formats negative number with rounding', () => {
    expect(formatSigned(-2.345)).toBe('-2.35');
  });
  it('handles zero and -0 as positive', () => {
    expect(formatSigned(0)).toBe('+0.00');
    expect(formatSigned(-0)).toBe('+0.00');
  });
  it('returns em dash for non-finite values', () => {
    expect(formatSigned(NaN)).toBe('—');
    expect(formatSigned(Infinity)).toBe('—');
    expect(formatSigned(-Infinity)).toBe('—');
    expect(formatSigned(undefined as any)).toBe('—');
  });
  it('respects custom digits', () => {
    // Node's toFixed behavior determines expected result
    expect(formatSigned(1.25, 1)).toBe('+' + (1.25).toFixed(1));
    expect(formatSigned(2.6, 0)).toBe('+' + (2.6).toFixed(0));
  });
});

describe('ytdComparator', () => {
  const make = (id: string, ytd?: number) => ({ id, ytdChangePercent: ytd } as any);
  it('sorts descending correctly', () => {
    const items = [make('a',1), make('b',5), make('c',3)];
    items.sort(ytdComparator('desc'));
    expect(items.map(i=>i.id)).toEqual(['b','c','a']);
  });
  it('sorts ascending correctly', () => {
    const items = [make('a',1), make('b',5), make('c',3)];
    items.sort(ytdComparator('asc'));
    expect(items.map(i=>i.id)).toEqual(['a','c','b']);
  });
  it('places non-finite values last (desc)', () => {
    const items = [make('a',NaN), make('b',2), make('c',undefined), make('d',-1)];
    items.sort(ytdComparator('desc'));
    // Expected order: b(2), d(-1), a(NaN), c(undefined)
    expect(items.map(i=>i.id)).toEqual(['b','d','a','c']);
  });
  it('places non-finite values last (asc)', () => {
    const items = [make('a',NaN), make('b',2), make('c',undefined), make('d',-1)];
    items.sort(ytdComparator('asc'));
    // Expected order: d(-1), b(2), a(NaN), c(undefined)
    expect(items.map(i=>i.id)).toEqual(['d','b','a','c']);
  });
  it('preserves order among equal non-finite values', () => {
    const items = [make('a',NaN), make('b',NaN), make('c',1)];
    items.sort(ytdComparator('asc'));
    // c first, then a,b in original order
    expect(items.map(i=>i.id)).toEqual(['c','a','b']);
  });
});
