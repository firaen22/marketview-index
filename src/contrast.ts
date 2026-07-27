/**
 * WCAG 2.x relative luminance and contrast ratio.
 *
 * Exists to gate the /present colour palette: the projector is a dim 720p unit
 * viewed from across a meeting room, so a colour that reads fine on a laptop can
 * be unreadable in the room. See contrast.test.ts, which resolves the actual
 * Tailwind palette and asserts a floor against the projector background.
 *
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

function parseHex(hex: string): [number, number, number] {
    if (typeof hex !== 'string') throw new TypeError(`Not a hex colour: ${String(hex)}`);
    const raw = hex.trim().replace(/^#/, '');
    const expanded =
        raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) throw new TypeError(`Not a hex colour: ${hex}`);
    return [
        parseInt(expanded.slice(0, 2), 16),
        parseInt(expanded.slice(2, 4), 16),
        parseInt(expanded.slice(4, 6), 16),
    ];
}

/** Linearise one 8-bit sRGB channel. */
function linearise(channel8: number): number {
    const c = channel8 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = parseHex(hex).map(linearise);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Order-independent. */
export function contrastRatio(hexA: string, hexB: string): number {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
}
