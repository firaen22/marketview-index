import { describe, it, expect } from 'vitest';
import {
    normalizeTerm,
    buildGlossaryLookup,
    lookupExplanation,
    overrideExplanations,
    type GlossaryEntry,
} from '../lib/jargonGlossary';

const ENTRIES: GlossaryEntry[] = [
    { aliases: ['basis point', 'bps', '基點'], explanation: { en: '1 bp = 0.01%.', 'zh-TW': '1 個基點 = 0.01%。' } },
    { aliases: ['duration', '存續期'], explanation: { en: 'Bond price sensitivity to rates.', 'zh-TW': '' } },
];
const LOOKUP = buildGlossaryLookup(ENTRIES);

describe('normalizeTerm', () => {
    it('lower-cases, trims, and collapses whitespace', () => {
        expect(normalizeTerm('  Basis   Point ')).toBe('basis point');
    });
    it('strips surrounding brackets and punctuation', () => {
        expect(normalizeTerm('（A類別）')).toBe('a類別');
        expect(normalizeTerm('bps.')).toBe('bps');
    });
    it('leaves Chinese characters intact', () => {
        expect(normalizeTerm('基點')).toBe('基點');
    });
});

describe('lookupExplanation', () => {
    it('matches any alias, case- and punctuation-insensitively', () => {
        expect(lookupExplanation('Basis Point', 'en', LOOKUP)).toBe('1 bp = 0.01%.');
        expect(lookupExplanation('BPS', 'en', LOOKUP)).toBe('1 bp = 0.01%.');
        expect(lookupExplanation('基點', 'zh-TW', LOOKUP)).toBe('1 個基點 = 0.01%。');
    });
    it('returns null for an unknown term', () => {
        expect(lookupExplanation('EBITDA', 'en', LOOKUP)).toBeNull();
    });
    it('returns null when the vetted explanation for that language is blank', () => {
        // "duration" has en filled but zh-TW blank — blank must be ignored.
        expect(lookupExplanation('duration', 'en', LOOKUP)).toBe('Bond price sensitivity to rates.');
        expect(lookupExplanation('存續期', 'zh-TW', LOOKUP)).toBeNull();
    });
});

describe('overrideExplanations', () => {
    it('replaces the explanation for matched, vetted terms and leaves others untouched', () => {
        const input = [
            { term: 'Basis Point', explanation: 'model wording that could be wrong' },
            { term: 'EBITDA', explanation: 'model wording, kept' },
        ];
        const out = overrideExplanations(input, 'en', LOOKUP);
        expect(out[0].explanation).toBe('1 bp = 0.01%.');
        expect(out[1].explanation).toBe('model wording, kept'); // unknown term passes through
    });
    it('keeps the model wording when the entry is blank for that language', () => {
        const input = [{ term: '存續期', explanation: 'model zh-TW wording' }];
        const out = overrideExplanations(input, 'zh-TW', LOOKUP);
        expect(out[0].explanation).toBe('model zh-TW wording');
    });
    it('preserves extra fields on the term object', () => {
        const input = [{ term: 'bps', explanation: 'x', term_extra: 42 }];
        const out = overrideExplanations(input, 'en', LOOKUP);
        expect(out[0]).toMatchObject({ term: 'bps', explanation: '1 bp = 0.01%.', term_extra: 42 });
    });
});
