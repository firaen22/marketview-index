import { describe, expect, it, vi } from 'vitest';
import type { PresentCommand } from '../lib/presentCommand';

vi.mock('./components/PdfViewer', () => ({
    PdfViewer: () => null,
}));

const { executePresentationCommandWithDeps } = await import('./PresentationPage');

function baseDeps(overrides: Record<string, unknown> = {}) {
    return {
        marketData: [],
        qp: {
            closeChart: vi.fn(),
            dismissSpotlight: vi.fn(),
            openChart: vi.fn(),
            openSpotlight: vi.fn(),
            allItems: [],
        },
        setRemoteCompare: vi.fn(),
        resetDwellCountdown: vi.fn(),
        mainView: 'heatmap',
        setMainView: vi.fn(),
        slideMode: 'pdf',
        pdfRef: { current: { prevPage: vi.fn(), nextPage: vi.fn(), goToPage: vi.fn() } },
        setJargonEnabled: vi.fn(),
        persistPresentCycle: vi.fn(),
        normalizedPresentCycle: { enabled: false, dwellSec: 45, views: ['slide', 'heatmap'] },
        setDataRange: vi.fn(),
        ...overrides,
    } as any;
}

describe('executePresentationCommandWithDeps', () => {
    it('retries goto after switching from a non-slide view, then jumps on the same command', () => {
        const command: PresentCommand = {
            v: 1,
            id: 'goto-1',
            kind: 'goto',
            symbols: [],
            page: 5,
            issuedAt: 1000,
        };
        const deps = baseDeps();

        expect(executePresentationCommandWithDeps(command, deps)).toBe(false);
        expect(deps.setMainView).toHaveBeenCalledWith('slide');
        expect(deps.resetDwellCountdown).toHaveBeenCalledTimes(1);
        expect(deps.pdfRef.current.goToPage).not.toHaveBeenCalled();

        const retryDeps = { ...deps, mainView: 'slide' };
        expect(executePresentationCommandWithDeps(command, retryDeps)).toBe(true);
        expect(deps.pdfRef.current.goToPage).toHaveBeenCalledWith(5);
        expect(deps.resetDwellCountdown).toHaveBeenCalledTimes(2);
    });
});
