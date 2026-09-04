// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { normalizePresentResume } from './settings';

const pdfjs = vi.hoisted(() => {
    interface FakeTask {
        promise: Promise<unknown>;
        destroy: ReturnType<typeof vi.fn>;
        resolve: (doc: unknown) => void;
    }
    const state: { task: FakeTask | null } = { task: null };
    return {
        state,
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: vi.fn(() => {
            let resolve!: (doc: unknown) => void;
            const promise = new Promise<unknown>(res => { resolve = res; });
            const task: FakeTask = { promise, destroy: vi.fn(), resolve };
            state.task = task;
            return task;
        }),
    };
});

vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const { PdfViewer } = await import('./components/PdfViewer');
type PdfViewerHandle = import('./components/PdfViewer').PdfViewerHandle;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fakeDoc = () => ({
    numPages: 10,
    destroy: vi.fn(),
    getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 960, height: 540 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [] }),
    })),
});

let root: Root;
let container: HTMLDivElement;

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {});
    }
}

describe('present resume validation', () => {
    it('rejects corrupt and partial shapes', () => {
        const corrupt = [
            undefined,
            null,
            {},
            { view: 'bogus', pdfPage: 2, slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: 2 },
            { view: 'slide', slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: '2', slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: 0, slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: -1, slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: Number.NaN, slideUpdatedAt: 10 },
            { view: 'slide', pdfPage: 2, slideUpdatedAt: '10' },
            { view: 'slide', pdfPage: 2, slideUpdatedAt: Number.POSITIVE_INFINITY },
        ];

        corrupt.forEach(value => expect(normalizePresentResume(value)).toBeNull());
    });

    it('accepts a valid resume state', () => {
        expect(normalizePresentResume({ view: 'heatmap', pdfPage: 4, slideUpdatedAt: 10 })).toEqual({
            view: 'heatmap',
            pdfPage: 4,
            slideUpdatedAt: 10,
        });
    });
});

describe('PdfViewer initialPage', () => {
    beforeEach(() => {
        pdfjs.state.task = null;
        pdfjs.getDocument.mockClear();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => { root.unmount(); });
        container.remove();
    });

    it.each([
        ['undefined', undefined, 1],
        ['zero', 0, 1],
        ['negative', -2, 1],
        ['NaN', Number.NaN, 1],
        ['infinite', Number.POSITIVE_INFINITY, 1],
        ['oversized', 42, 10],
        ['in range', 7, 7],
    ] as const)('clamps %s to page %s', async (_name, initialPage, expectedPage) => {
        const ref = createRef<PdfViewerHandle>();
        await act(async () => {
            root.render(createElement(PdfViewer, { url: '/deck.pdf', initialPage, ref }));
        });
        await act(async () => { pdfjs.state.task!.resolve(fakeDoc()); });
        await flush();

        expect(container.textContent).toContain(`${expectedPage} / 10`);
    });
});
