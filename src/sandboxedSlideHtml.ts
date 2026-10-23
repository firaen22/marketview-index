// HTML slides render in <iframe srcDoc sandbox="allow-scripts">. Do not add
// allow-same-origin (sandbox escape, architecture invariant).
//
// Verified 2026-10-23, headless Chrome  (local page.pdf):
// a direct <iframe src="page.pdf"> paints the page (white, text visible);
// the same PDF nested inside a srcdoc iframe does not paint, with or without
// sandbox="allow-scripts" — the cell stays the dark srcdoc background.
// The live gray projector was that failed nest (body #111 / empty frame)
// inside SlideRenderer's sandboxed srcdoc. The fix used on the call (raster
// JPEG + white body) was abandoned because it replaced the real deck.
// Here, a nested PDF iframe is removed and the document gets a white base
// so a failed embed cannot show the dark shell. Present the deck in PDF mode
// and use the overlay command for a chart on top of it.

const PDF_IFRAME = /<iframe\b([^>]*?)\bsrc\s*=\s*(['"])([\s\S]*?)\2([^>]*)>(?:\s*<\/iframe>)?/gi;

export function isNestedPdfSrc(src: string): boolean {
    const value = src.trim().toLowerCase();
    if (!value || value.startsWith('javascript:') || value.startsWith('data:')) return false;
    if (value.includes('/api/pdf-proxy')) return true;
    if (value.includes('application/pdf')) return true;
    return /\.pdf(?:$|[?#])/.test(value);
}

function injectBaseStyle(html: string, css: string): string {
    const tag = `<style data-sandbox-base="1">${css}</style>`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, match => `${match}${tag}`);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, match => `${match}<head>${tag}</head>`);
    return `<!DOCTYPE html><html><head>${tag}</head><body>${html}</body></html>`;
}

export function prepareSandboxedSlideHtml(html: string): string {
    let stripped = false;
    const next = html.replace(PDF_IFRAME, (tag, _before, _quote, src) => {
        if (!isNestedPdfSrc(src)) return tag;
        stripped = true;
        return '<div data-sandboxed-pdf="blocked" style="background:#ffffff;min-height:100vh;width:100%"></div>';
    });
    // Author backgrounds still win when no PDF iframe was removed (no
    // !important). A stripped embed forces white: that document was trying
    // to show the deck and a dark shell is the gray-blank failure.
    const css = stripped
        ? 'html,body{background-color:#ffffff !important;margin:0}'
        : 'html,body{background-color:#ffffff}';
    return injectBaseStyle(next, css);
}
