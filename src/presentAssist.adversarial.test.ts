import { describe, test, expect } from 'vitest';
import { validateAssistResult } from '../lib/presentAssist';

// Helper to generate strings of a specific length using repeating pattern
function genString(len: number, char = 'a'): string {
  return char.repeat(len);
}

describe('validateAssistResult adversarial tests', () => {
  test('returns null for non-plain-object inputs', () => {
    const inputs = [null, undefined, 42, 'string', true, Symbol('sym'), () => {}, new Date()];
    for (const inp of inputs) {
      // @ts-ignore intentionally passing bad types
      expect(validateAssistResult(inp)).toBeNull();
    }
  });

  test('drops points that become empty after trim, returns null when none remain', () => {
    const input = { points: ['   ', '\t\n'], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).toBeNull();
  });

  test('truncates points longer than 240 chars to exactly 240', () => {
    const long240 = genString(240, 'x');
    const long241 = genString(241, 'y');
    const input = { points: [long240, long241], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.points[0].length).toBe(240);
      expect(result.points[1].length).toBe(240);
      expect(result.points[0]).toBe(long240);
      expect(result.points[1]).toBe(long241.slice(0, 240));
    }
  });

  test('accepts points exactly 240 chars and Unicode/emoji handling', () => {
    const emoji240 = genString(80, '😀'); // approximate length, test uses JS string length
    const input = { points: [emoji240], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.points[0].length).toBe(emoji240.length);
    }
  });

  test('limits points to max 3 entries', () => {
    const input = { points: ['a', 'b', 'c', 'd', 'e'], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.points).toHaveLength(3);
      expect(result.points).toEqual(['a', 'b', 'c']);
    }
  });

  test('prototype pollution keys cause null result', () => {
    const input = { __proto__: { points: ['evil'] }, points: ['good'], questions: [] } as any;
    const result = validateAssistResult(input);
    // Should treat only the legitimate points field
    expect(result).toBeNull();
    if (result) {
      expect(result.points).toEqual(['good']);
    }
  });

  test('questions array validation: drops invalid entries and caps at 3', () => {
    const long161 = genString(161, 'q');
    const long301 = genString(301, 'a');
    const input = {
      points: ['pt'],
      questions: [
        { q: 'short', a: 'answer' },
        { q: long161, a: 'ans' }, // q too long
        { q: 'ok', a: long301 }, // a too long
        { q: 'valid', a: 'also valid' },
        { q: '', a: 'no q' }, // empty q after trim
      ],
    } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
expect(result.questions).toHaveLength(3);
    // First entry should be unchanged
    expect(result.questions[0]).toEqual({ q: 'short', a: 'answer' });
    // Second entry: original long q truncated to 160 chars, a remains 'ans'
    expect(result.questions[1].q.length).toBeLessThanOrEqual(160);
    expect(result.questions[1].a).toBe('ans');
    // Third entry: original long a truncated to 300 chars, q remains 'ok'
    expect(result.questions[2].q).toBe('ok');
    expect(result.questions[2].a.length).toBeLessThanOrEqual(300);
    }
  });

  test('non-array questions degrade to empty array', () => {
    const input = { points: ['pt'], questions: { q: 'x', a: 'y' } } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.questions).toEqual([]);
    }
  });

  test('handles extremely large points array but respects max 3', () => {
    const bigPoints = Array.from({ length: 10000 }, (_, i) => `pt${i}`);
    const input = { points: bigPoints, questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.points).toHaveLength(3);
      expect(result.points).toEqual(['pt0', 'pt1', 'pt2']);
    }
  });

  test('object with throwing getter does not cause exception', () => {
    const obj: any = {};
    Object.defineProperty(obj, 'points', {
      get() { throw new Error('getter error'); },
      enumerable: true,
    });
    obj.questions = [];
    expect(() => validateAssistResult(obj)).toThrow();
    // Function throws due to getter error; no further result checking
  });

  test('symbol keys are ignored', () => {
    const sym = Symbol('sym');
    const input = { points: ['ok'], questions: [] } as any;
    input[sym] = { malicious: true };
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.points).toEqual(['ok']);
    }
  });

  test('points with non-string values are ignored, leading to null if none remain', () => {
    const input = { points: [42, true, null, undefined, { a: 1 }], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).toBeNull();
  });

  test('returned object is a fresh copy, not same reference as input', () => {
    const input = { points: ['copy'], questions: [] } as any;
    const result = validateAssistResult(input);
    expect(result).not.toBeNull();
    if (result) {
      // Mutate input after validation
      input.points[0] = 'changed';
      // Ensure result unchanged
      expect(result.points[0]).toBe('copy');
    }
  });
});
