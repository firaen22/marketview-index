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
});
