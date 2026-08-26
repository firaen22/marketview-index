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

const { PdfViewer, PDF_STALL_TIMEOUT_MS } = await import('./PdfViewer');
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

describe('PdfViewer never leaves the projector on an endless spinner', () => {
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

    it('surfaces an error and a retry once the transfer goes silent', async () => {
        await render();
        await flush();
        expect(text()).toContain('Loading PDF');

        await act(async () => { await vi.advanceTimersByTimeAsync(PDF_STALL_TIMEOUT_MS + 1); });
        await flush();

        expect(text()).toContain('PDF stopped loading');
        expect(text()).toContain('Retry');
        expect(text()).not.toContain('Loading PDF');
        expect(pdfjs.state.task!.destroy).toHaveBeenCalled();
    });

    it('does not abort a slow deck that is still delivering bytes', async () => {
        await render();
        await flush();

        // Three quiet-but-progressing stretches, each just under the cap. A
        // total-elapsed timeout would have killed this healthy load.
        for (const loaded of [5_000_000, 12_000_000, 20_000_000]) {
            await act(async () => { await vi.advanceTimersByTimeAsync(PDF_STALL_TIMEOUT_MS - 1_000); });
            act(() => { pdfjs.state.task!.onProgress!({ loaded, total: 22_499_981 }); });
            await flush();
        }

        expect(text()).not.toContain('PDF stopped loading');
        expect(text()).toContain('Loading PDF');
        expect(pdfjs.state.task!.destroy).not.toHaveBeenCalled();
    });

    it('shows how far along a slow deck is, so a slow load does not read as a hang', async () => {
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

    it('retry starts a fresh load task', async () => {
        await render();
        await flush();
        await act(async () => { await vi.advanceTimersByTimeAsync(PDF_STALL_TIMEOUT_MS + 1); });
        await flush();
        expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);

        const button = container.querySelector('button');
        expect(button?.textContent).toContain('Retry');
        await act(async () => {
            button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await flush();

        expect(pdfjs.getDocument).toHaveBeenCalledTimes(2);
        expect(text()).toContain('Loading PDF');
        expect(text()).not.toContain('PDF stopped loading');
    });
});
