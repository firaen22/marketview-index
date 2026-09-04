import { describe, expect, it } from 'vitest';
import { parsePresentResume, resolvePresentResume, type PresentResume } from './presentResume';

function testParse(input: unknown, expected: PresentResume | null) {
    expect(parsePresentResume(input)).toEqual(expected);
}

describe('parsePresentResume', () => {
    it('returns null for null', () => {
        testParse(null, null);
    });
    it('returns null for undefined', () => {
        testParse(undefined, null);
    });
    it('returns null for array', () => {
        testParse([1, 2, 3], null);
    });
    it('returns null for string', () => {
        testParse('hello', null);
    });
    it('returns null if missing view', () => {
        testParse({ pdfPage: 1, slideUpdatedAt: 0 }, null);
    });
    it('returns null if missing pdfPage', () => {
        testParse({ view: 'slide', slideUpdatedAt: 0 }, null);
    });
    it('returns null if missing slideUpdatedAt', () => {
        testParse({ view: 'slide', pdfPage: 1 }, null);
    });
    it("returns null if view is 'pdf'", () => {
        testParse({ view: 'pdf', pdfPage: 1, slideUpdatedAt: 0 }, null);
    });
    it('pdfPage 0 invalid', () => {
        testParse({ view: 'slide', pdfPage: 0, slideUpdatedAt: 0 }, null);
    });
    it('pdfPage -1 invalid', () => {
        testParse({ view: 'slide', pdfPage: -1, slideUpdatedAt: 0 }, null);
    });
    it('pdfPage 1.5 invalid', () => {
        testParse({ view: 'slide', pdfPage: 1.5, slideUpdatedAt: 0 }, null);
    });
    it('pdfPage NaN invalid', () => {
        testParse({ view: 'slide', pdfPage: NaN, slideUpdatedAt: 0 }, null);
    });
    it('pdfPage Infinity invalid', () => {
        testParse({ view: 'slide', pdfPage: Infinity, slideUpdatedAt: 0 }, null);
    });
    it("pdfPage '3' as string invalid", () => {
        // @ts-ignore
        testParse({ view: 'slide', pdfPage: '3', slideUpdatedAt: 0 }, null);
    });
    it('slideUpdatedAt -1 invalid', () => {
        testParse({ view: 'slide', pdfPage: 1, slideUpdatedAt: -1 }, null);
    });
    it('slideUpdatedAt NaN invalid', () => {
        testParse({ view: 'slide', pdfPage: 1, slideUpdatedAt: NaN }, null);
    });
    it('valid object', () => {
        const obj = { view: 'heatmap', pdfPage: 5, slideUpdatedAt: 123 } as PresentResume;
        testParse(obj, obj);
    });
});

describe('resolvePresentResume', () => {
    const current = 42;
    it('returns default when saved is null', () => {
        expect(resolvePresentResume(null, current)).toEqual({ view: 'slide', pdfPage: 1 });
    });
    it('returns default when slideUpdatedAt mismatched', () => {
        const saved: PresentResume = { view: 'index', pdfPage: 3, slideUpdatedAt: 99 };
        expect(resolvePresentResume(saved, current)).toEqual({ view: 'slide', pdfPage: 1 });
    });
    it('returns saved when match', () => {
        const saved: PresentResume = { view: 'heatmap', pdfPage: 10, slideUpdatedAt: current };
        expect(resolvePresentResume(saved, current)).toEqual({ view: 'heatmap', pdfPage: 10 });
    });
});
