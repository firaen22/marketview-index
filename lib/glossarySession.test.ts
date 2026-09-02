import { describe, expect, it } from 'vitest';
import {
    type GlossarySession,
    type GlossaryTermSnapshot,
    generateJoinCode,
    isValidJoinCode,
    mergeTerms,
    normalizeJoinCode,
    publicSessionView,
    visiblePageCeiling,
    visibleTerms,
} from './glossarySession';

function makeSession(partial: Partial<GlossarySession> = {}): GlossarySession {
    return {
        joinCode: 'ABCD2345',
        version: 0,
        status: 'live',
        mode: 'gradual',
        currentPage: 0,
        maxPage: 0,
        slideVersion: 0,
        startedAt: 1,
        endedAt: null,
        keepAfter: true,
        joins: 0,
        terms: [],
        updatedAt: 1,
        ...partial,
    };
}

describe('glossary session pure helpers', () => {
    it('generates strict 8-character join codes from the allowed alphabet', () => {
        for (let i = 0; i < 50; i += 1) {
            const code = generateJoinCode();

            expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
            expect(isValidJoinCode(code)).toBe(true);
        }
        expect(isValidJoinCode('abcd2345')).toBe(false);
        expect(isValidJoinCode('ABCI2345')).toBe(false);
        expect(isValidJoinCode('ABCL2345')).toBe(false);
    });

    it('normalizes lowercase and whitespace join codes without weakening strict validation', () => {
        expect(normalizeJoinCode(' abcd2345 ')).toBe('ABCD2345');
        expect(normalizeJoinCode('ABCI2345')).toBeNull();
        expect(normalizeJoinCode(123)).toBeNull();
    });

    it('handles empty pushes by leaving terms unchanged', () => {
        const existing = [{
            id: 'duration',
            term: 'Duration',
            explanation: { en: 'Rate sensitivity' },
            firstPage: 2,
            unlockedAt: 100,
        }];

        expect(mergeTerms(existing, [], 'en', 3, 200)).toEqual({
            terms: existing,
            termLimitReached: false,
        });
    });

    it('dedupes duplicate terms across pages and preserves first appearance', () => {
        // Not a vetted glossary term — those get their explanation replaced by the vetted text
        const first = mergeTerms([], [{ term: 'Dedupe Term', explanation: 'First' }], 'en', 2, 100).terms;
        const second = mergeTerms(first, [{ term: 'dedupe term', explanation: 'Second' }], 'en', 5, 200).terms;

        expect(second).toHaveLength(1);
        expect(second[0]).toMatchObject({
            term: 'Dedupe Term',
            firstPage: 2,
            unlockedAt: 100,
            explanation: { en: 'First' },
        });
    });

    it('fills the other language when the same term arrives later', () => {
        const first = mergeTerms([], [{ term: 'Custom Term', explanation: 'English text' }], 'en', 1, 100).terms;
        const second = mergeTerms(first, [{ term: 'custom term', explanation: '中文解釋' }], 'zh-TW', 1, 200).terms;

        expect(second).toHaveLength(1);
        expect(second[0].explanation).toEqual({ en: 'English text', 'zh-TW': '中文解釋' });
        expect(second[0].firstPage).toBe(1);
        expect(second[0].unlockedAt).toBe(100);
    });

    it('enriches glossary aliases with both vetted languages', () => {
        const fromEnglish = mergeTerms([], [{ term: 'bps', explanation: 'model text' }], 'en', 1, 100).terms[0];
        const fromChinese = mergeTerms([], [{ term: '基點', explanation: '模型文字' }], 'zh-TW', 1, 100).terms[0];

        expect(fromEnglish.explanation.en).toContain('1/100th of 1%');
        expect(fromEnglish.explanation['zh-TW']).toContain('百分之零點零一');
        expect(fromChinese.explanation.en).toContain('1/100th of 1%');
        expect(fromChinese.explanation['zh-TW']).toContain('百分之零點零一');
    });

    it('drops entries with empty terms or whitespace explanations', () => {
        const result = mergeTerms([], [
            { term: '   ', explanation: 'text' },
            { term: 'Real', explanation: '   ' },
        ], 'en', 1, 100);

        expect(result).toEqual({ terms: [], termLimitReached: false });
    });

    it('caps stored terms at 200 while still updating existing entries and raising the flag', () => {
        const existing: GlossaryTermSnapshot[] = Array.from({ length: 200 }, (_, index) => ({
            id: `term ${index}`,
            term: `Term ${index}`,
            explanation: { en: `English ${index}` },
            firstPage: 1,
            unlockedAt: 100,
        }));

        const result = mergeTerms(existing, [
            { term: 'Term 5', explanation: '中文 5' },
            { term: 'New Term', explanation: 'Should not be added' },
        ], 'zh-TW', 9, 200);

        expect(result.termLimitReached).toBe(true);
        expect(result.terms).toHaveLength(200);
        expect(result.terms[5].explanation).toEqual({ en: 'English 5', 'zh-TW': '中文 5' });
        expect(result.terms.some(term => term.id === 'new term')).toBe(false);
    });

    it('filters live gradual visibility by current page and public audience shape follows it', () => {
        const visible = { id: 'visible', term: 'Visible', explanation: { en: 'Yes' }, firstPage: 2, unlockedAt: 0 };
        const future = { id: 'future', term: 'Future', explanation: { en: 'No' }, firstPage: 3, unlockedAt: 100 };
        const session = makeSession({ terms: [visible, future], joins: 3, currentPage: 2, updatedAt: 500 });

        expect(visibleTerms(session)).toEqual([visible]);
        expect(visibleTerms({ ...session, currentPage: 1 })).toEqual([]);
        expect(visibleTerms({ ...session, mode: 'all' })).toEqual([visible, future]);
        expect(visibleTerms({ ...session, status: 'ended' })).toEqual([visible, future]);
        expect(publicSessionView(session)).toEqual({
            status: 'live',
            mode: 'gradual',
            currentPage: 2,
            termCount: 1,
            joins: 3,
            updatedAt: 500,
            terms: [visible],
        });
    });

    it('uses the high-water mark for gradual visibility', () => {
        const terms = [1, 2, 5].map(firstPage => ({
            id: `page-${firstPage}`,
            term: `Page ${firstPage}`,
            explanation: { en: 'Text' },
            firstPage,
            unlockedAt: 0,
        }));

        expect(visibleTerms(makeSession({ terms, currentPage: 3, maxPage: 5 }))).toEqual(terms);
    });

    it('uses currentPage when maxPage is absent or non-finite', () => {
        const terms = [1, 2, 5].map(firstPage => ({
            id: `page-${firstPage}`,
            term: `Page ${firstPage}`,
            explanation: { en: 'Text' },
            firstPage,
            unlockedAt: 0,
        }));
        const legacy = makeSession({ terms, currentPage: 3 }) as Omit<GlossarySession, 'maxPage'> as GlossarySession;

        expect(visibleTerms(legacy)).toEqual(terms.slice(0, 2));
        expect(visibleTerms({ ...legacy, maxPage: NaN })).toEqual(terms.slice(0, 2));
    });

    it('lets currentPage jump ahead of maxPage', () => {
        const term = { id: 'page-5', term: 'Page 5', explanation: { en: 'Text' }, firstPage: 5, unlockedAt: 0 };

        expect(visibleTerms(makeSession({ terms: [term], currentPage: 8, maxPage: 5 }))).toEqual([term]);
    });

    it('keeps all-mode and ended sessions fully visible', () => {
        const terms = [
            { id: 'page-5', term: 'Page 5', explanation: { en: 'Text' }, firstPage: 5, unlockedAt: 0 },
        ];

        expect(visibleTerms(makeSession({ terms, mode: 'all', currentPage: 0, maxPage: 0 }))).toEqual(terms);
        expect(visibleTerms(makeSession({ terms, status: 'ended', currentPage: 0, maxPage: 0 }))).toEqual(terms);
    });

    it('calculates the ceiling from finite numeric pages', () => {
        expect(visiblePageCeiling({ currentPage: 3, maxPage: 'x' as any } as GlossarySession)).toBe(3);
        expect(visiblePageCeiling({ currentPage: -1 as any, maxPage: 2 } as GlossarySession)).toBe(2);
    });
});
