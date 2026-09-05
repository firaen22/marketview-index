import { describe, expect, it, vi } from 'vitest';

vi.mock('./components/PdfViewer', () => ({
    PdfViewer: () => null,
}));

const { nextPdfZoom } = await import('./PresentationPage');

describe('nextPdfZoom', () => {
    it.each([
        [100, 'in', 125],
        [100, 'out', 75],
        [175, 'in', 200],
        [50, 'out', 25],
        [25, 'in', 50],
        [50, 'in', 75],
        [75, 'in', 100],
        [125, 'in', 150],
        [150, 'in', 175],
        [75, 'out', 50],
        [125, 'out', 100],
        [150, 'out', 125],
        [175, 'out', 150],
    ] as const)('%s + %s steps to %s', (current, direction, expected) => {
        expect(nextPdfZoom(current, direction)).toBe(expected);
    });

    it.each([
        [200, 'in', 100],
        [25, 'out', 100],
        [200, 'out', 175],
        [25, 'in', 50],
        // Near-clamp must step onto the clamp, not jump to 100 — the extra
        // same-direction pinch is what recovers to fit.
        [199, 'in', 200],
        [26, 'out', 25],
    ] as const)('%s + %s at/near clamp → %s', (current, direction, expected) => {
        expect(nextPdfZoom(current, direction)).toBe(expected);
    });

    it.each([
        [NaN, 'in'],
        [NaN, 'out'],
        [Infinity, 'in'],
        [Infinity, 'out'],
        [-Infinity, 'in'],
        [-Infinity, 'out'],
        [0, 'in'],
        [0, 'out'],
        [-1, 'in'],
        [-25, 'out'],
        [201, 'in'],
        [201, 'out'],
        [24, 'in'],
        [24, 'out'],
        [999, 'in'],
        [Number.MAX_VALUE, 'out'],
        [Number.MIN_VALUE, 'in'],
    ] as const)('corrupt %s + %s snaps to 100', (current, direction) => {
        expect(nextPdfZoom(current, direction)).toBe(100);
    });

    it.each([
        [110, 'in'],
        [110, 'out'],
        [37, 'in'],
        [163, 'out'],
    ] as const)('off-grid %s + %s lands in [25, 200]', (current, direction) => {
        const result = nextPdfZoom(current, direction);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(25);
        expect(result).toBeLessThanOrEqual(200);
    });

    it('always returns a finite number in [25, 200]', () => {
        const currents = [
            NaN, Infinity, -Infinity, 0, -1, -25, 24, 25, 26, 37,
            50, 75, 100, 110, 125, 150, 163, 175, 199, 200, 201, 999,
            Number.MAX_VALUE, Number.MIN_VALUE,
        ];
        for (const current of currents) {
            for (const direction of ['in', 'out'] as const) {
                const result = nextPdfZoom(current, direction);
                expect(Number.isFinite(result)).toBe(true);
                expect(result).toBeGreaterThanOrEqual(25);
                expect(result).toBeLessThanOrEqual(200);
            }
        }
    });
});

const { pdfDeckOnScreen, pinchShouldLatch } = await import('./PresentationPage');

describe('pdfDeckOnScreen', () => {
    it.each([
        ['slide', 'pdf', 'data:application/pdf;base64,AAAA', true],
        ['slide', 'pdf', '', false],
        ['slide', 'pdf', '   \n\t', false],
        ['slide', 'markdown', '# hi', false],
        ['index', 'pdf', 'data:application/pdf;base64,AAAA', false],
        ['heatmap', 'pdf', 'data:application/pdf;base64,AAAA', false],
    ] as const)('%s / %s / %j → %s', (view, mode, content, expected) => {
        expect(pdfDeckOnScreen(view, { mode, content })).toBe(expected);
    });
});

describe('pinchShouldLatch', () => {
    it('lets an ordinary mid-range step continue the stream', () => {
        expect(pinchShouldLatch(100, 125)).toBe(false);
        expect(pinchShouldLatch(100, 75)).toBe(false);
        expect(pinchShouldLatch(150, 175)).toBe(false);
    });

    it('latches on landing at either clamp so the reset needs a fresh gesture', () => {
        expect(pinchShouldLatch(175, 200)).toBe(true);
        expect(pinchShouldLatch(50, 25)).toBe(true);
    });

    it('latches on a clamp reset or garbage recovery', () => {
        expect(pinchShouldLatch(200, 100)).toBe(true);
        expect(pinchShouldLatch(25, 100)).toBe(true);
        expect(pinchShouldLatch(NaN, 100)).toBe(true);
        expect(pinchShouldLatch(999, 100)).toBe(true);
    });

    it('one long pinch-in from 100 stops at 200 and does not reset', () => {
        // Drive the page's exact per-crossing logic the way the hook does:
        // each threshold crossing calls the handler until one returns 'latch'.
        let zoom = 100;
        let latched = false;
        for (let crossing = 0; crossing < 8; crossing++) {
            if (latched) continue;
            const next = nextPdfZoom(zoom, 'in');
            latched = pinchShouldLatch(zoom, next);
            zoom = next;
        }
        expect(zoom).toBe(200);
        expect(latched).toBe(true);
    });
});
