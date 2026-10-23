import { describe, expect, it } from 'vitest';
import { isNestedPdfSrc, prepareSandboxedSlideHtml } from './sandboxedSlideHtml';

describe('prepareSandboxedSlideHtml', () => {
    it('replaces a nested PDF iframe with a white block and forces a white base', () => {
        const html = '<html><head></head><body style="background:#111"><iframe src="/api/pdf-proxy?key=1.pdf"></iframe></body></html>';
        const prepared = prepareSandboxedSlideHtml(html);
        expect(prepared).not.toContain('<iframe');
        expect(prepared).toContain('data-sandboxed-pdf="blocked"');
        expect(prepared).toContain('background-color:#ffffff !important');
        expect(prepared).toContain('background:#111');
    });

    it('leaves a non-PDF iframe alone and does not force author colors', () => {
        const html = '<html><head></head><body style="background:#0a0a0a"><iframe src="https://example.com/embed"></iframe></body></html>';
        const prepared = prepareSandboxedSlideHtml(html);
        expect(prepared).toContain('src="https://example.com/embed"');
        expect(prepared).not.toContain('!important');
        expect(prepared).toContain('background-color:#ffffff');
    });

    it('recognizes pdf-proxy and .pdf sources and ignores other urls', () => {
        expect(isNestedPdfSrc('/api/pdf-proxy?key=abc')).toBe(true);
        expect(isNestedPdfSrc('https://cdn.example/deck.pdf')).toBe(true);
        expect(isNestedPdfSrc('https://cdn.example/deck.pdf?page=2')).toBe(true);
        expect(isNestedPdfSrc('https://example.com/not-a-pdf')).toBe(false);
        expect(isNestedPdfSrc('javascript:alert(1)')).toBe(false);
        expect(isNestedPdfSrc('')).toBe(false);
    });
});
