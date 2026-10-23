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

export function isNestedPdfSrc(src: string, options?: { decodeEntities?: boolean }): boolean {
    // DOM attribute values are already entity-decoded; only the raw-tag scanner
    // should decode (&amp;#46; → &#46; → .). Double-decoding turns /deck&#46;pdf
    // into a false-positive PDF path.
    const value = (options?.decodeEntities === false ? src : decodeHtmlEntities(src)).trim();
    if (!value || /^javascript:/i.test(value)) return false;
    if (/^data:application\/pdf(?:;|,|$)/i.test(value)) return true;
    if (/^data:/i.test(value)) return false;

    try {
        const pathname = new URL(value, 'https://sandbox.invalid').pathname.toLowerCase();
        return /\.pdf\/?$/.test(pathname)
            || pathname === '/api/pdf-proxy'
            || pathname.endsWith('/api/pdf-proxy');
    } catch {
        return false;
    }
}

function decodeHtmlEntities(value: string): string {
    const decodeCodePoint = (entity: string, value: number): string =>
        Number.isInteger(value) && value >= 0 && value <= 0x10ffff
            ? String.fromCodePoint(value)
            : entity;
    return value.replace(/&(?:#x([\da-f]+)|#(\d+)|([a-z]+));/gi, (entity, hex, decimal, named) => {
        if (hex) {
            return decodeCodePoint(entity, Number.parseInt(hex, 16));
        }
        if (decimal) {
            return decodeCodePoint(entity, Number.parseInt(decimal, 10));
        }
        return ({ amp: '&', apos: "'", gt: '>', lt: '<', nbsp: '\u00a0', quot: '"' } as Record<string, string>)[named.toLowerCase()] ?? entity;
    });
}

function tagEnd(html: string, start: number): number {
    let quote = '';
    for (let i = start; i < html.length; i += 1) {
        const char = html[i];
        if (quote) {
            if (char === quote) quote = '';
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '>') {
            return i + 1;
        }
    }
    return html.length;
}

function tagName(tag: string): string | null {
    const match = /^<\s*([a-z][\w:-]*)\b/i.exec(tag);
    return match?.[1]?.toLowerCase() ?? null;
}

function iframeSrc(tag: string): string | null {
    const name = tagName(tag);
    if (name !== 'iframe') return null;
    const attrs = /^<\s*[a-z][\w:-]*\b([\s\S]*?)\/?\s*>$/i.exec(tag)?.[1] ?? '';
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let match = attrPattern.exec(attrs); match; match = attrPattern.exec(attrs)) {
        if (match[1].toLowerCase() === 'src') return match[2] ?? match[3] ?? match[4] ?? '';
    }
    return null;
}

function stripNestedPdfIframes(html: string): { html: string; stripped: boolean } {
    if (typeof DOMParser !== 'undefined') {
        try {
            const document = new DOMParser().parseFromString(html, 'text/html');
            const iframes = Array.from(document.querySelectorAll('iframe[src]'));
            let stripped = false;
            for (const iframe of iframes) {
                const src = iframe.getAttribute('src');
                if (src === null || !isNestedPdfSrc(src, { decodeEntities: false })) continue;
                const blocker = document.createElement('div');
                blocker.setAttribute('data-sandboxed-pdf', 'blocked');
                blocker.setAttribute('style', 'background:#ffffff;min-height:100vh;width:100%');
                iframe.replaceWith(blocker);
                stripped = true;
            }
            if (iframes.length === 0 || !stripped) return { html, stripped: false };
            const doctype = /^\s*(<!doctype[^>]*>)/i.exec(html)?.[1] ?? '';
            return { html: `${doctype}${document.documentElement.outerHTML}`, stripped };
        } catch {
            // Fall through to the scanner for runtimes with a partial DOMParser.
        }
    }

    let output = '';
    let cursor = 0;
    let stripped = false;
    let skipped: string | null = null;

    while (cursor < html.length) {
        if (skipped) {
            // Raw-text elements may contain bare `<` (e.g. `1 < 2`). Jump to the
            // matching close tag instead of treating every `<` as markup.
            const close = new RegExp(`</\\s*${skipped}\\s*>`, 'i');
            const rest = html.slice(cursor);
            const match = close.exec(rest);
            if (!match) {
                output += html.slice(cursor);
                break;
            }
            const end = cursor + match.index + match[0].length;
            output += html.slice(cursor, end);
            cursor = end;
            skipped = null;
            continue;
        }
        const commentStart = html.indexOf('<!--', cursor);
        const tagStart = html.indexOf('<', cursor);
        if (tagStart < 0) {
            output += html.slice(cursor);
            break;
        }
        if (commentStart === tagStart) {
            const commentEnd = html.indexOf('-->', tagStart + 4);
            const end = commentEnd < 0 ? html.length : commentEnd + 3;
            output += html.slice(cursor, end);
            cursor = end;
            continue;
        }
        const end = tagEnd(html, tagStart);
        const tag = html.slice(tagStart, end);
        const name = tagName(tag);
        if (name === 'script' || name === 'style' || name === 'textarea') {
            output += html.slice(cursor, end);
            cursor = end;
            skipped = name;
            continue;
        }
        const src = iframeSrc(tag);
        if (src !== null && isNestedPdfSrc(src, { decodeEntities: true })) {
            output += html.slice(cursor, tagStart);
            output += '<div data-sandboxed-pdf="blocked" style="background:#ffffff;min-height:100vh;width:100%"></div>';
            cursor = end;
            stripped = true;
            continue;
        }
        output += html.slice(cursor, end);
        cursor = end;
    }
    return { html: output, stripped };
}

function findMarkupTag(html: string, names: readonly string[]): { start: number; end: number; name: string } | null {
    let cursor = 0;
    let skipped: string | null = null;
    while (cursor < html.length) {
        if (skipped) {
            const close = new RegExp(`</\\s*${skipped}\\s*>`, 'i');
            const rest = html.slice(cursor);
            const match = close.exec(rest);
            if (!match) return null;
            cursor += match.index + match[0].length;
            skipped = null;
            continue;
        }
        const commentStart = html.indexOf('<!--', cursor);
        const tagStart = html.indexOf('<', cursor);
        if (tagStart < 0) return null;
        if (commentStart === tagStart) {
            const commentEnd = html.indexOf('-->', tagStart + 4);
            cursor = commentEnd < 0 ? html.length : commentEnd + 3;
            continue;
        }
        const end = tagEnd(html, tagStart);
        const tag = html.slice(tagStart, end);
        const name = tagName(tag);
        if (!name) {
            cursor = end;
            continue;
        }
        if (name === 'script' || name === 'style' || name === 'textarea') {
            cursor = end;
            skipped = name;
            continue;
        }
        if (names.includes(name)) return { start: tagStart, end, name };
        cursor = end;
    }
    return null;
}

function injectBaseStyle(html: string, css: string): string {
    const tag = `<style data-sandbox-base="1">${css}</style>`;
    if (typeof DOMParser !== 'undefined') {
        try {
            const document = new DOMParser().parseFromString(html, 'text/html');
            const style = document.createElement('style');
            style.setAttribute('data-sandbox-base', '1');
            style.textContent = css;
            const head = document.head ?? document.documentElement;
            head.insertBefore(style, head.firstChild);
            const doctype = /^\s*(<!doctype[^>]*>)/i.exec(html)?.[1] ?? '';
            return `${doctype}${document.documentElement.outerHTML}`;
        } catch {
            // Fall through to the markup-aware injector.
        }
    }
    const head = findMarkupTag(html, ['head']);
    if (head) return `${html.slice(0, head.end)}${tag}${html.slice(head.end)}`;
    const htmlTag = findMarkupTag(html, ['html']);
    if (htmlTag) {
        return `${html.slice(0, htmlTag.end)}<head>${tag}</head>${html.slice(htmlTag.end)}`;
    }
    return `<!DOCTYPE html><html><head>${tag}</head><body>${html}</body></html>`;
}

export function prepareSandboxedSlideHtml(html: string): string {
    const { html: next, stripped } = stripNestedPdfIframes(html);
    // Author backgrounds still win when no PDF iframe was removed (no
    // !important). A stripped embed forces white: that document was trying
    // to show the deck and a dark shell is the gray-blank failure.
    const css = stripped
        ? 'html,body{background-color:#ffffff !important;margin:0}'
        : 'html,body{background-color:#ffffff}';
    return injectBaseStyle(next, css);
}
