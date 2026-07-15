// presentCommand.extra.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseCommandDeterministic,
  validatePresentIntent,
  isExecutablePresentCommand,
  shouldExecute,
} from '../lib/presentCommand';

// A minimal catalog used by all tests
const catalog = [
  { symbol: 'AAA', name: 'Alpha', nameEn: 'Alpha', group: 'market' as const },
  { symbol: 'BBB', name: 'Beta', nameEn: 'Beta', group: 'market' as const },
  { symbol: 'CCC', name: 'Gamma', nameEn: 'Gamma', group: 'macro' as const },
];

/* -------------------------------------------------------------------------- */
/*                         parseCommandDeterministic tests                     */
/* -------------------------------------------------------------------------- */
describe('parseCommandDeterministic – edge‑case parsing', () => {
  // CJK phrase not mapped to a known word → should return null
  it('returns null for unknown CJK word', () => {
    expect(parseCommandDeterministic('未知指令', catalog)).toBeNull();
  });

  // Mixed‑width comma separator (English comma + full‑width comma) → still parses as compare
  it('handles mixed‑width commas in compare', () => {
    const intent = parseCommandDeterministic('AAA, BBB，CCC', catalog);
    expect(intent).toEqual({
      kind: 'compare',
      symbols: ['AAA', 'BBB', 'CCC'],
    });
  });

  // Caret variants: leading '^' should be stripped when matching symbols
  it('strips leading caret from symbol in compare', () => {
    const intent = parseCommandDeterministic('^AAA vs ^BBB', catalog);
    expect(intent).toEqual({
      kind: 'compare',
      symbols: ['AAA', 'BBB'],
    });
  });

  // Zero‑width space (U+200B) is *not* whitespace for the parser → treated as part of the token → no match → null
  it('treats zero‑width space as regular character (no match)', () => {
    const zeroWidth = 'A\u200BAA'; // "A​AA"
    expect(parseCommandDeterministic(zeroWidth, catalog)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*                         validatePresentIntent – edge cases                 */
/* -------------------------------------------------------------------------- */
describe('validatePresentIntent – adversarial inputs', () => {
  // Prototype‑pollution shaped object – properties are inherited, not own.
  // The validator uses plain property access, so inherited values are accepted.
  it('accepts objects with prototype‑inherited fields (prototype pollution)', () => {
    const polluted = Object.create({ kind: 'clear', symbols: [] });
    expect(validatePresentIntent(polluted, catalog)).toEqual({
      ok: true,
      intent: { kind: 'clear', symbols: [] },
    });
  });

  // Compare with six market symbols – the validator slices to the max of five.
  it('truncates compare symbols to five', () => {
    const raw = {
      kind: 'compare',
      symbols: ['AAA', 'BBB', 'AAA', 'BBB', 'AAA', 'BBB'],
      view: undefined,
    };
    const result = validatePresentIntent(raw, catalog);
    expect(result).toEqual({
      ok: true,
      intent: { kind: 'compare', symbols: ['AAA', 'BBB'] }, // after dedupe & slice → two distinct symbols
    });
  });

  // Symbol length edge: 24 characters allowed, 25 rejected.
  it('rejects symbols longer than 24 characters', () => {
    const long = 'X'.repeat(25);
    const raw = { kind: 'chart', symbols: [long] };
    const result = validatePresentIntent(raw, catalog);
    expect(result.ok).toBe(false);
  });

  it('accepts symbols exactly 24 characters long', () => {
    const exactly = 'X'.repeat(24);
    // Add to catalog temporarily for lookup
    const extendedCatalog = [
      ...catalog,
      { symbol: exactly, name: 'Long', nameEn: undefined, group: 'market' as const },
    ];
    const raw = { kind: 'chart', symbols: [exactly] };
    const result = validatePresentIntent(raw, extendedCatalog);
    expect(result).toEqual({
      ok: true,
      intent: { kind: 'chart', symbols: [exactly] },
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                         isExecutablePresentCommand – edge cases              */
/* -------------------------------------------------------------------------- */
describe('isExecutablePresentCommand – structural validation', () => {
  // Valid id length: 64 characters allowed
  it('accepts id of length 64', () => {
    const id64 = 'a'.repeat(64);
    const cmd = {
      v: 1,
      id: id64,
      kind: 'chart',
      symbols: ['AAA'],
      issuedAt: Date.now(),
    };
    expect(isExecutablePresentCommand(cmd)).toBe(true);
  });

  // Id length 65 should be rejected
  it('rejects id of length 65', () => {
    const id65 = 'a'.repeat(65);
    const cmd = {
      v: 1,
      id: id65,
      kind: 'chart',
      symbols: ['AAA'],
      issuedAt: Date.now(),
    };
    expect(isExecutablePresentCommand(cmd)).toBe(false);
  });

  // Symbols array with one entry of length 24 (allowed)
  it('accepts symbol of length 24', () => {
    const sym24 = 'X'.repeat(24);
    const cmd = {
      v: 1,
      id: 'id',
      kind: 'chart',
      symbols: [sym24],
      issuedAt: Date.now(),
    };
    expect(isExecutablePresentCommand(cmd)).toBe(true);
  });

  // Symbols array with one entry of length 25 (rejected)
  it('rejects symbol of length 25', () => {
    const sym25 = 'X'.repeat(25);
    const cmd = {
      v: 1,
      id: 'id',
      kind: 'chart',
      symbols: [sym25],
      issuedAt: Date.now(),
    };
    expect(isExecutablePresentCommand(cmd)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                         shouldExecute – temporal edge cases                 */
/* -------------------------------------------------------------------------- */
describe('shouldExecute – issuedAt boundaries', () => {
  const now = Date.now();

  it('executes when issuedAt is exactly now - STALE_MS (120 000 ms)', () => {
    const cmd = {
      v: 1,
      id: 'unique',
      kind: 'chart',
      symbols: ['AAA'],
      issuedAt: now - 120_000,
    };
    expect(shouldExecute(cmd, null, now)).toBe(true);
  });

  it('does not execute when issuedAt is just older than stale window', () => {
    const cmd = {
      v: 1,
      id: 'unique2',
      kind: 'chart',
      symbols: ['AAA'],
      issuedAt: now - 120_001,
    };
    expect(shouldExecute(cmd, null, now)).toBe(false);
  });

  it('does not re‑execute a command with the same id as lastExecutedId', () => {
    const cmd = {
      v: 1,
      id: 'same-id',
      kind: 'chart',
      symbols: ['AAA'],
      issuedAt: now,
    };
    expect(shouldExecute(cmd, 'same-id', now)).toBe(false);
  });
});
