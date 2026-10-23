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

    it('does not inspect iframe text inside script content', () => {
        const scriptBody = 'const template = `<iframe src="deck.pdf"></iframe>`;';
        const prepared = prepareSandboxedSlideHtml(`<script>${scriptBody}</script>`);
        expect(prepared).toContain(scriptBody);
        expect(() => new Function(scriptBody)).not.toThrow();
        expect(prepared).not.toContain('data-sandboxed-pdf="blocked"');
    });

    it('requires the exact src attribute', () => {
        const prepared = prepareSandboxedSlideHtml('<iframe data-src="deck.pdf" src="chart.html"></iframe>');
        expect(prepared).toContain('data-src="deck.pdf" src="chart.html"');
    });

    it.each([
        ['<iframe src=deck.pdf></iframe>', true],
        ['<iframe src=deck&#46;pdf></iframe>', true],
        ['<iframe src="data:application/pdf;base64,AAAA"></iframe>', true],
        ['<iframe src="https://x/deck.pdf/"></iframe>', true],
        ['<iframe src="viewer.html?file=x.pdf"></iframe>', false],
        ['<iframe src="/api/pdf-proxy-notes"></iframe>', false],
    ])('classifies %s as nested PDF: %s', (html, blocked) => {
        const prepared = prepareSandboxedSlideHtml(html);
        expect(prepared.includes('data-sandboxed-pdf="blocked"')).toBe(blocked);
    });

    it('does not inject base style into a head string inside a script', () => {
        const html = '<script>const x = "<head>"; document.body.textContent = "Ready";</script>';
        const prepared = prepareSandboxedSlideHtml(html);
        const script = prepared.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
        expect(script).toContain('const x = "<head>";');
        expect(script).not.toContain('data-sandbox-base');
        expect(() => new Function(script)).not.toThrow();
    });

    it('still strips a PDF iframe after a script that contains a bare < comparison', () => {
        const html = '<script>if (1 < 2) console.log("ok");</script><iframe src="deck.pdf"></iframe>';
        const prepared = prepareSandboxedSlideHtml(html);
        expect(prepared).toContain('data-sandboxed-pdf="blocked"');
        expect(prepared).not.toMatch(/<iframe\b/i);
        expect(prepared).toContain('if (1 < 2) console.log("ok");');
    });

    it('does not double-decode DOM attribute entities into a false PDF path', () => {
        // After one HTML decode, src is the literal characters deck&#46;pdf — not a .pdf URL.
        expect(isNestedPdfSrc('deck&#46;pdf', { decodeEntities: false })).toBe(false);
        expect(isNestedPdfSrc('deck&#46;pdf', { decodeEntities: true })).toBe(true);
    });
});
