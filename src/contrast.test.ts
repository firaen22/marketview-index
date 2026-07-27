import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relativeLuminance, contrastRatio } from './contrast';

/**
 * Standing legibility gate for the /present projector palette.
 *
 * Tailwind 4 defines its palette in oklch, so asserting hardcoded v3 hex values
 * would gate colours the app does not actually render. This resolves the real
 * shipped values out of node_modules/tailwindcss/theme.css and converts them to
 * sRGB, so the gate tracks whatever Tailwind version is installed.
 *
 * Background: the projector status bar is `bg-zinc-950/95` over `bg-black`
 * (PresentationPage.tsx), which composites to ~#09090b — the same value as
 * `body { background: #09090b }` in index.css.
 */

const PROJECTOR_BG = '#09090b';

/** WCAG 1.4.3 AA for normal-size text. */
const TEXT_FLOOR = 4.5;
/** WCAG 1.4.11 for non-text UI components — the state dots are exactly this. */
const INDICATOR_FLOOR = 3.0;

const THEME_CSS = readFileSync('node_modules/tailwindcss/theme.css', 'utf8');

/** OKLab -> linear sRGB -> gamma-encoded hex. */
function tailwindHex(name: string): string {
    const m = THEME_CSS.match(new RegExp(`--color-${name}:\\s*oklch\\(([^)]+)\\)`));
    if (!m) throw new Error(`Tailwind colour not found: ${name}`);
    const [rawL, rawC, rawH] = m[1].trim().split(/\s+/);
    const L = rawL.endsWith('%') ? parseFloat(rawL) / 100 : parseFloat(rawL);
    const c = parseFloat(rawC);
    const h = (parseFloat(rawH) * Math.PI) / 180;

    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m2 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    const linear = [
        4.0767416621 * l - 3.3077115913 * m2 + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m2 - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m2 + 1.7076147010 * s,
    ];
    const hex = linear
        .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055))
        .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
        .join('');
    return `#${hex}`;
}

describe('WCAG maths', () => {
    it('matches the reference extremes', () => {
        expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
        expect(relativeLuminance('#000000')).toBeCloseTo(0, 10);
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    });

    it('is order-independent and bottoms out at 1', () => {
        expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
        expect(contrastRatio('#7f7f7f', '#7f7f7f')).toBeCloseTo(1, 10);
    });

    it('accepts shorthand and a missing hash', () => {
        expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 10);
        expect(contrastRatio('fff', '000')).toBeCloseTo(21, 10);
    });

    it('rejects malformed input loudly rather than returning 0', () => {
        for (const bad of ['', '#12', '#12345', 'zzzzzz', '#gggggg']) {
            expect(() => relativeLuminance(bad), bad).toThrow(TypeError);
        }
        expect(() => relativeLuminance(null as unknown as string)).toThrow(TypeError);
    });
});

describe('projector palette legibility', () => {
    // Phase label text in MarketStatusChip, and the DataFreshness badge text.
    const TEXT_COLOURS = [
        'emerald-400', // open
        'amber-400',   // lunch
        'zinc-400',    // closed
        'sky-400',     // holiday
        'amber-300',   // DataFreshness stale
        'rose-300',    // DataFreshness unavailable
    ];

    // Status dots and other non-text state indicators.
    const INDICATOR_COLOURS = ['emerald-400', 'amber-400', 'zinc-500', 'sky-400'];

    for (const name of TEXT_COLOURS) {
        it(`${name} clears ${TEXT_FLOOR}:1 as text on the projector background`, () => {
            const ratio = contrastRatio(tailwindHex(name), PROJECTOR_BG);
            expect(ratio, `${name} = ${tailwindHex(name)} -> ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT_FLOOR);
        });
    }

    for (const name of INDICATOR_COLOURS) {
        it(`${name} clears ${INDICATOR_FLOOR}:1 as a state indicator`, () => {
            const ratio = contrastRatio(tailwindHex(name), PROJECTOR_BG);
            expect(ratio, `${name} = ${tailwindHex(name)} -> ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(INDICATOR_FLOOR);
        });
    }

    it('keeps every phase colour distinguishable from every other', () => {
        // Four phases must not collapse into each other at a distance.
        const phases = ['emerald-400', 'amber-400', 'zinc-500', 'sky-400'].map(tailwindHex);
        for (let i = 0; i < phases.length; i++) {
            for (let j = i + 1; j < phases.length; j++) {
                expect(phases[i], `phases ${i}/${j} are the same colour`).not.toBe(phases[j]);
            }
        }
    });

    // Decorative separators use zinc-600 (~2.58:1). WCAG exempts purely
    // decorative content, and they are aria-hidden, so they are deliberately
    // NOT gated here — but they must never be used to carry state.
    it('documents that zinc-600 is below both floors and is decorative only', () => {
        expect(contrastRatio(tailwindHex('zinc-600'), PROJECTOR_BG)).toBeLessThan(INDICATOR_FLOOR);
    });
});

/**
 * The lists above are hand-maintained, which is exactly how the phase-word span
 * shipped as text-zinc-500 (4.12:1) while every *named* colour passed: the name
 * list was built from PHASE_STYLES rather than from what the component renders.
 * This walks the source instead, so any text-* class added to these components
 * must be gated or explicitly declared decorative.
 */
describe('projector components declare no ungated text colour', () => {
    // Colours allowed to sit below the text floor, with the reason they are exempt.
    const DECORATIVE = new Set([
        'zinc-600', // "·" separators, aria-hidden (asserted decorative above)
    ]);

    const COMPONENTS = [
        'src/components/MarketStatusChip.tsx',
        'src/components/DataFreshness.tsx',
    ];

    for (const path of COMPONENTS) {
        it(`${path} renders only contrast-gated text colours`, () => {
            const src = readFileSync(path, 'utf8');
            // Tailwind text-<palette>-<step>; ignores text-[10px], text-[clamp(...)].
            const used = new Set(
                [...src.matchAll(/\btext-([a-z]+-\d{2,3})\b/g)].map((m) => m[1]),
            );
            expect(used.size, `no text-* classes found in ${path} — regex is stale`).toBeGreaterThan(0);

            for (const name of used) {
                if (DECORATIVE.has(name)) continue;
                const ratio = contrastRatio(tailwindHex(name), PROJECTOR_BG);
                expect(
                    ratio,
                    `${path} renders text-${name} (${ratio.toFixed(2)}:1). Either raise it to ` +
                    `>= ${TEXT_FLOOR}:1 or add it to DECORATIVE with a reason.`,
                ).toBeGreaterThanOrEqual(TEXT_FLOOR);
            }
        });
    }
});
