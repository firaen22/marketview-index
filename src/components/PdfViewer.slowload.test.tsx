// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Only pdfjs is faked. The loading task is handed out so a test can decide
// whether it ever settles and whether it ever reports progress.
const pdfjs = vi.hoisted(() => {
    interface FakeTask {
        promise: Promise<unknown>;
        destroy: ReturnType<typeof vi.fn>;
        onProgress?: (p: { loaded: number; total: number }) => void;
        resolve: (doc: unknown) => void;
        reject: (err: unknown) => void;
    }
    const state: { task: FakeTask | null } = { task: null };
    return {
        state,
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: vi.fn(() => {
            let resolve!: (doc: unknown) => void;
            let reject!: (err: unknown) => void;
            const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
            // A load that never settles is the production symptom: the transfer
            // wedges mid-flight, so neither then nor catch ever runs.
            promise.catch(() => { /* the component owns the rejection */ });
            const task: FakeTask = { promise, destroy: vi.fn(), resolve, reject };
            state.task = task;
            return task;
        }),
    };
});

vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const { PdfViewer, PDF_SLOW_LOAD_HINT_MS } = await import('./PdfViewer');
type PdfViewerHandle = import('./PdfViewer').PdfViewerHandle;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    }
}

function render(url = '/api/pdf-proxy?key=1700000000000-abcdef123456-deck.pdf') {
    return act(async () => {
        root.render(createElement(PdfViewer, { url, ref: createRef<PdfViewerHandle>() }));
    });
}

const text = () => container.textContent ?? '';

// The nav pill always renders arrow buttons, so find Retry by its label.
const retryButton = () =>
    Array.from(container.querySelectorAll('button'))
        .find(b => (b.textContent ?? '').includes('Retry')) ?? null;

// Enough of a PDFDocumentProxy for the render effect to run without throwing.
const fakeDoc = () => ({
    numPages: 10,
    destroy: vi.fn(),
    getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 960, height: 540 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [] }),
    })),
});

describe('PdfViewer never leaves the projector with no way out', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        pdfjs.state.task = null;
        pdfjs.getDocument.mockClear();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => { root.unmount(); });
        container.remove();
        vi.useRealTimers();
    });

    it('offers a reload once a load is taking a long time', async () => {
        await render();
        await flush();
        expect(text()).toContain('Loading PDF');
        expect(retryButton()).toBeNull();

        await act(async () => { await vi.advanceTimersByTimeAsync(PDF_SLOW_LOAD_HINT_MS + 1); });
        await flush();

        expect(text()).toContain('Still loading');
        expect(text()).toContain('Retry');
    });

    it('never discards a slow load, however long it runs', async () => {
        await render();
        await flush();

        // Ten minutes with no progress callback at all — the exact production
        // shape, since pdfjs detaches onProgress when the server supports both
        // streaming and ranges. The load must survive untouched.
        await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
        await flush();

        expect(pdfjs.state.task!.destroy).not.toHaveBeenCalled();
        expect(text()).toContain('Loading PDF');
        expect(text()).not.toContain('Failed');

        // ...and it still completes normally when the bytes finally land.
        await act(async () => {
            pdfjs.state.task!.resolve(fakeDoc());
        });
        await flush();
        expect(text()).not.toContain('Loading PDF');
    });

    it('shows a percentage when pdfjs does report progress', async () => {
        await render();
        await flush();
        act(() => { pdfjs.state.task!.onProgress!({ loaded: 11_249_990, total: 22_499_981 }); });
        await flush();
        expect(text()).toContain('50%');
    });

    it('reports no percentage when the server sends no length', async () => {
        await render();
        await flush();
        act(() => { pdfjs.state.task!.onProgress!({ loaded: 1_000, total: 0 }); });
        await flush();
        expect(text()).toContain('Loading PDF');
        expect(text()).not.toContain('%');
    });

    it('surfaces a genuine load failure with a retry', async () => {
        await render();
        await flush();
        await act(async () => {
            pdfjs.state.task!.reject(new Error('PDF not found'));
        });
        await flush();
        expect(text()).toContain('PDF not found');
        expect(text()).toContain('Retry');
        expect(text()).not.toContain('Loading PDF');
    });

    it('retry starts a genuinely fresh load task', async () => {
        await render();
        await flush();
        await act(async () => { pdfjs.state.task!.reject(new Error('PDF not found')); });
        await flush();
        expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);

        await act(async () => {
            retryButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await flush();

        expect(pdfjs.getDocument).toHaveBeenCalledTimes(2);
        expect(text()).toContain('Loading PDF');
        expect(text()).not.toContain('PDF not found');
    });

    it('hides retry on a page-render error so an already-loaded deck cannot be discarded', async () => {
        await render();
        await flush();
        const doc = fakeDoc();
        // A page-render failure re-uses the same `error` state as a load
        // failure, but the deck is already resident: a Retry click would
        // re-download and reset to slide 1 mid-presentation, so this path
        // must not offer one.
        doc.getPage = vi.fn(async () => { throw new Error('page render failed'); });
        await act(async () => { pdfjs.state.task!.resolve(doc); });
        await flush();

        expect(text()).toContain('page render failed');
        expect(retryButton()).toBeNull();
        expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    });

    it('a task abandoned by a url change cannot settle into the new load', async () => {
        await render('/api/pdf-proxy?key=1700000000000-abcdef123456-first.pdf');
        await flush();
        const first = pdfjs.state.task!;

        await render('/api/pdf-proxy?key=1700000000000-abcdef123456-second.pdf');
        await flush();
        expect(first.destroy).toHaveBeenCalled();

        // The abandoned task settling late must not touch the live render.
        await act(async () => { first.reject(new Error('stale deck failed')); });
        await flush();
        expect(text()).not.toContain('stale deck failed');
        expect(text()).toContain('Loading PDF');
    });

    it('leaves no timer armed after unmount', async () => {
        await render();
        await flush();
        await act(async () => { root.unmount(); });
        expect(vi.getTimerCount()).toBe(0);
        root = createRoot(container);
    });

    it('keeps the loaded deck and the presenter\'s page across a language change', async () => {
        // The presenter flips language in the control tab; useSettingsSync
        // pushes it to the projector mid-presentation. That must not re-download
        // a 20MB deck or throw away the page the audience is looking at.
        const ref = createRef<PdfViewerHandle>();
        const doc = fakeDoc();
        await act(async () => {
            root.render(createElement(PdfViewer, { url: '/deck.pdf', ref, lang: 'en' }));
        });
        await act(async () => { pdfjs.state.task!.resolve(doc); });
        await flush();
        act(() => { ref.current!.goToPage(7); });
        await flush();
        expect(text()).toContain('7 / 10');
        expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.render(createElement(PdfViewer, { url: '/deck.pdf', ref, lang: 'zh-TW' }));
        });
        await flush();

        expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
        expect(doc.destroy).not.toHaveBeenCalled();
        expect(text()).toContain('7 / 10');
    });
});
