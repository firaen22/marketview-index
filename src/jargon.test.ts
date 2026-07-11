import { describe, expect, it } from 'vitest';
import {
    JARGON_MAX_TEXT_LEN,
    isJargonEligible,
    jargonCacheKey,
    parseJargonResponse,
    prepareJargonText,
} from './jargon';

describe('jargon helpers', () => {
    it('checks page text eligibility', () => {
        expect(isJargonEligible('')).toBe(false);
        expect(isJargonEligible('      ')).toBe(false);
        expect(isJargonEligible('x'.repeat(39))).toBe(false);
        expect(isJargonEligible(`  ${'x'.repeat(39)}  `)).toBe(false);
        expect(isJargonEligible('x'.repeat(40))).toBe(true);
        expect(isJargonEligible(42 as unknown as string)).toBe(false);
    });

    it('prepares text by trimming, collapsing whitespace, and truncating', () => {
        expect(prepareJargonText('  hello \n\t world   again  ')).toBe('hello world again');
        expect(prepareJargonText(` ${'x'.repeat(JARGON_MAX_TEXT_LEN + 100)} `)).toHaveLength(JARGON_MAX_TEXT_LEN);
    });

    it('builds cache keys with page and language separation', () => {
        expect(jargonCacheKey('/deck.pdf', 3, 'en', 'text')).toBe('/deck.pdf#3#en#text');
        expect(jargonCacheKey('/deck.pdf', 3, 'en', 'text')).not.toBe(jargonCacheKey('/deck.pdf', 3, 'zh-TW', 'text'));
    });

    it('passes through valid jargon payloads', () => {
        expect(parseJargonResponse({
            success: true,
            terms: [
                { term: 'duration', explanation: 'Sensitivity to interest-rate changes.' },
                { term: 'basis point', explanation: 'One hundredth of one percentage point.' },
            ],
        })).toEqual([
            { term: 'duration', explanation: 'Sensitivity to interest-rate changes.' },
            { term: 'basis point', explanation: 'One hundredth of one percentage point.' },
        ]);
    });

    it('caps parsed terms at four entries', () => {
        const terms = Array.from({ length: 6 }, (_, index) => ({
            term: `term ${index}`,
            explanation: `explanation ${index}`,
        }));
        expect(parseJargonResponse({ success: true, terms })).toHaveLength(4);
    });

    it('filters malformed entries', () => {
        expect(parseJargonResponse({
            success: true,
            terms: [
                null,
                123,
                { term: '', explanation: 'empty term' },
                { term: 'missing explanation' },
                { explanation: 'missing term' },
                { term: 'non-string explanation', explanation: 5 },
                { term: 5, explanation: 'non-string term' },
                { term: '  EBITDA margin ', explanation: '  Profitability after operating expenses. ' },
            ],
        })).toEqual([
            { term: 'EBITDA margin', explanation: 'Profitability after operating expenses.' },
        ]);
    });

    it('caps parsed term and explanation lengths', () => {
        const [term] = parseJargonResponse({
            success: true,
            terms: [{ term: 'x'.repeat(100), explanation: 'y'.repeat(240) }],
        });
        expect(term.term).toHaveLength(80);
        expect(term.explanation).toHaveLength(200);
    });

    it('returns an empty list for invalid payload shapes without throwing', () => {
        const inputs = [
            null,
            undefined,
            {},
            { success: false, terms: [{ term: 'duration', explanation: 'x' }] },
            { success: true, terms: 'nope' },
            [{ term: 'duration', explanation: 'x' }],
            'nope',
            123,
        ];

        for (const input of inputs) {
            expect(() => parseJargonResponse(input)).not.toThrow();
            expect(parseJargonResponse(input)).toEqual([]);
        }
    });
});
