import { describe, expect, it } from 'vitest';
import {
    assistCacheKey,
    buildAssistPrompt,
    normalizeAssistText,
    validateAssistResult,
} from '../lib/presentAssist';

describe('present assist helpers', () => {
    it('normalizes whitespace and builds stable full Redis cache keys', () => {
        expect(normalizeAssistText('  Alpha\n\n beta\tgamma  ')).toBe('Alpha beta gamma');
        expect(assistCacheKey('Alpha   beta', 'en')).toBe(assistCacheKey(' Alpha beta ', 'en'));
        expect(assistCacheKey('Alpha beta', 'en')).not.toBe(assistCacheKey('Alpha beta', 'zh-TW'));
        expect(assistCacheKey('Alpha beta', 'en')).toMatch(/^present:assist:v1:[a-f0-9]{64}$/);
    });

    it('canonicalizes valid results and strips extra keys', () => {
        const input = {
            points: ['  First point  ', 'Second point'],
            questions: [{ q: '  Why? ', a: ' Because. ', extra: true }],
            extra: 'strip',
        };

        const result = validateAssistResult(input);

        expect(result).toEqual({
            points: ['First point', 'Second point'],
            questions: [{ q: 'Why?', a: 'Because.' }],
        });
        expect(result).not.toBe(input);
    });

    it('truncates field lengths and keeps at most three entries', () => {
        const result = validateAssistResult({
            points: ['a'.repeat(500), 'b', 'c', 'd'],
            questions: [
                { q: 'q'.repeat(500), a: 'a'.repeat(500) },
                { q: 'q2', a: 'a2' },
                { q: 'q3', a: 'a3' },
                { q: 'q4', a: 'a4' },
            ],
        });

        expect(result?.points).toHaveLength(3);
        expect(result?.points[0]).toHaveLength(240);
        expect(result?.questions).toHaveLength(3);
        expect(result?.questions[0].q).toHaveLength(160);
        expect(result?.questions[0].a).toHaveLength(300);
    });

    it('drops malformed entries while allowing zero valid questions', () => {
        expect(validateAssistResult({
            points: [123, ' good ', '', null],
            questions: [
                { q: 'missing answer' },
                ['array'],
                { q: ' ', a: 'answer' },
            ],
        })).toEqual({ points: ['good'], questions: [] });
    });

    it('treats missing or non-array questions as empty', () => {
        expect(validateAssistResult({ points: ['a', 'b', 'c', 'd', 'e'] }))
            .toEqual({ points: ['a', 'b', 'c'], questions: [] });
        expect(validateAssistResult({ points: ['a'], questions: 'nope' }))
            .toEqual({ points: ['a'], questions: [] });
    });

    it('rejects array input and results with no valid points', () => {
        expect(validateAssistResult([])).toBeNull();
        expect(validateAssistResult({ points: ['', 1], questions: [] })).toBeNull();
        expect(validateAssistResult({ points: [], questions: [] })).toBeNull();
    });

    it('never leaves a lone high surrogate when truncation lands mid-emoji', () => {
        const point = `${'a'.repeat(239)}😀`;
        const result = validateAssistResult({ points: [point], questions: [] });

        expect(result).not.toBeNull();
        const clipped = result!.points[0];
        expect(clipped).toHaveLength(239);
        const last = clipped.charCodeAt(clipped.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    });

    it('drops prototype-pollution-shaped question entries', () => {
        const result = validateAssistResult({
            points: ['point'],
            questions: [
                JSON.parse('{"q":"bad","a":"bad","__proto__":{"polluted":true}}'),
                { q: 'ok', a: 'fine' },
            ],
        });

        expect(result).toEqual({ points: ['point'], questions: [{ q: 'ok', a: 'fine' }] });
    });

    it('builds system and user messages with language directives and slide text', () => {
        const prompt = buildAssistPrompt('Revenue rose because margins improved.', 'zh-TW');
        const joined = JSON.stringify(prompt);

        expect(joined).toContain('Traditional Chinese');
        expect(joined).toContain('繁體中文');
        expect(joined).toContain('mixed financial ability');
        expect(joined).toContain('Revenue rose because margins improved.');
        expect(joined).toContain('STRICT JSON');
    });
});
