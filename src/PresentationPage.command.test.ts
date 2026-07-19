import { describe, expect, it, vi } from 'vitest';
import type { PresentCommand } from '../lib/presentCommand';

vi.mock('./components/PdfViewer', () => ({
    PdfViewer: () => null,
}));

const { executePresentationCommandWithDeps, fetchExplainTerm, handlePdfPageChangeWithDeps } = await import('./PresentationPage');

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
        // Mirrors the real handle: goToPage reports false until the document
        // has pages (PdfViewer returns false while numPages <= 0).
        pdfRef: { current: { prevPage: vi.fn(), nextPage: vi.fn(), goToPage: vi.fn(() => true) } },
        setJargonEnabled: vi.fn(),
        persistPresentCycle: vi.fn(),
        normalizedPresentCycle: { enabled: false, dwellSec: 45, views: ['slide', 'heatmap'] },
        setDataRange: vi.fn(),
        showExplainTerm: vi.fn(),
        clearRemoteJargon: vi.fn(),
        postToIndexIframe: vi.fn(() => true),
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

    it('does not consume a goto while the PDF document is still loading', () => {
        const command: PresentCommand = {
            v: 1,
            id: 'goto-2',
            kind: 'goto',
            symbols: [],
            page: 12,
            issuedAt: 1000,
        };
        // PdfViewer publishes its imperative handle at mount, before
        // getDocument() resolves, so the ref is non-null but paging fails.
        const loading = baseDeps({
            mainView: 'slide',
            pdfRef: { current: { prevPage: vi.fn(), nextPage: vi.fn(), goToPage: vi.fn(() => false) } },
        });

        // false => usePresentCommand leaves the id unlocked, so the next poll
        // retries instead of losing the page turn.
        expect(executePresentationCommandWithDeps(command, loading)).toBe(false);
        expect(loading.resetDwellCountdown).not.toHaveBeenCalled();

        const ready = baseDeps({ mainView: 'slide' });
        expect(executePresentationCommandWithDeps(command, ready)).toBe(true);
        expect(ready.pdfRef.current.goToPage).toHaveBeenCalledWith(12);
    });

    it('executes explain immediately through the injected presenter callback', () => {
        const command: PresentCommand = {
            v: 1,
            id: 'explain-1',
            kind: 'explain',
            symbols: [],
            term: 'duration',
            issuedAt: 1000,
        };
        const deps = baseDeps();

        expect(executePresentationCommandWithDeps(command, deps)).toBe(true);
        expect(deps.showExplainTerm).toHaveBeenCalledWith('duration', 'explain-1');
    });

    it('retries highlight while switching to index, then posts to the iframe when ready', () => {
        const command: PresentCommand = {
            v: 1,
            id: 'highlight-1',
            kind: 'highlight',
            symbols: ['^HSI'],
            issuedAt: 1000,
        };
        const deps = baseDeps({ mainView: 'slide' });

        expect(executePresentationCommandWithDeps(command, deps)).toBe(false);
        expect(deps.setMainView).toHaveBeenCalledWith('index');
        expect(deps.postToIndexIframe).not.toHaveBeenCalled();

        const readyDeps = baseDeps({ mainView: 'index' });
        expect(executePresentationCommandWithDeps(command, readyDeps)).toBe(true);
        expect(readyDeps.postToIndexIframe).toHaveBeenCalledWith({ type: 'mv-highlight', symbol: '^HSI' });

        const notReadyDeps = baseDeps({ mainView: 'index', postToIndexIframe: vi.fn(() => false) });
        expect(executePresentationCommandWithDeps(command, notReadyDeps)).toBe(false);
    });

    it('clears remote jargon synchronously on clear commands', () => {
        const command: PresentCommand = { v: 1, id: 'clear-1', kind: 'clear', symbols: [], issuedAt: 1000 };
        const deps = baseDeps();

        expect(executePresentationCommandWithDeps(command, deps)).toBe(true);
        expect(deps.clearRemoteJargon).toHaveBeenCalledTimes(1);
    });
});

describe('fetchExplainTerm', () => {
    it('posts JSON without slideId and prefers the matching returned term', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            success: true,
            terms: [
                { term: 'other', explanation: 'Other' },
                { term: 'Duration', explanation: 'Matched' },
            ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchExplainTerm('duration', 'en', 'key')).resolves.toEqual({ term: 'Duration', explanation: 'Matched' });
        expect(fetchMock).toHaveBeenCalledWith('/api/explain-jargon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key' },
            body: JSON.stringify({ text: 'duration', lang: 'en' }),
            signal: undefined,
        });
        const init = (fetchMock as any).mock.calls[0][1] as RequestInit;
        expect(JSON.parse(init.body as string)).toEqual({ text: 'duration', lang: 'en' });
        expect(init.body as string).not.toContain('slideId');
        vi.unstubAllGlobals();
    });
});

describe('handlePdfPageChangeWithDeps', () => {
    function jargonDeps(lastPage: number) {
        return {
            lastPage,
            clearRemoteJargon: vi.fn(),
            onJargonPageChange: vi.fn(),
        };
    }

    it('clears the presenter explain card on a real page turn', () => {
        const deps = jargonDeps(3);

        handlePdfPageChangeWithDeps(4, deps);

        expect(deps.clearRemoteJargon).toHaveBeenCalledTimes(1);
        expect(deps.onJargonPageChange).toHaveBeenCalledTimes(1);
    });

    it('keeps the explain card when PdfViewer re-fires the same page', () => {
        // PdfViewer re-invokes onPageChange whenever the callback identity
        // churns; an unchanged page must not wipe a card just requested.
        const deps = jargonDeps(3);

        handlePdfPageChangeWithDeps(3, deps);

        expect(deps.clearRemoteJargon).not.toHaveBeenCalled();
        expect(deps.onJargonPageChange).toHaveBeenCalledTimes(1);
    });

    it('does not clear on the first render or after a deck-swap reset', () => {
        const deps = jargonDeps(0);

        handlePdfPageChangeWithDeps(1, deps);

        expect(deps.clearRemoteJargon).not.toHaveBeenCalled();
        expect(deps.onJargonPageChange).toHaveBeenCalledTimes(1);
    });
});
