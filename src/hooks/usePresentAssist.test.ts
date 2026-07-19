import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../pdfText', () => ({
    loadPdf: vi.fn(),
    extractPdfPageText: vi.fn(),
}));

const {
    isAssistTextEligible,
    prepareAssistRequestText,
    presentAssistBackoffMs,
} = await import('./usePresentAssist');

describe('usePresentAssist helpers', () => {
    it('uses bounded projector poll backoff', () => {
        expect(presentAssistBackoffMs(1)).toBe(8000);
        expect(presentAssistBackoffMs(2)).toBe(16000);
        expect(presentAssistBackoffMs(3)).toBe(32000);
        expect(presentAssistBackoffMs(99)).toBe(32000);
    });

    it('gates short text and lets exactly 40 chars through', () => {
        expect(isAssistTextEligible('x'.repeat(39))).toBe(false);
        expect(isAssistTextEligible('x'.repeat(40))).toBe(true);
        expect(isAssistTextEligible(`  ${'x'.repeat(40)}  `)).toBe(true);
        expect(isAssistTextEligible('   ')).toBe(false);
    });

    it('truncates oversized client text to exactly 6000 before fetchAssist', () => {
        const prepared = prepareAssistRequestText(` ${'x'.repeat(6001)} `);

        expect(prepared).toHaveLength(6000);
        expect(prepared).toBe('x'.repeat(6000));
    });

    it('never emits a half surrogate pair when the 6000 cut lands mid-character', () => {
        // 5999 units + one astral char (2 units) = 6001: the cut falls between
        // the two halves of the emoji.
        const prepared = prepareAssistRequestText('x'.repeat(5999) + '\u{1F4C8}');

        // A trailing high surrogate (0xD800-0xDBFF) is an orphaned pair half.
        const lastUnit = prepared.charCodeAt(prepared.length - 1);
        expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(false);
        expect(prepared).toHaveLength(5999);
        // Still capped: the server rejects anything over 6000 UTF-16 units.
        expect(prepareAssistRequestText('x'.repeat(6000) + '\u{1F4C8}')).toHaveLength(6000);
    });
});
