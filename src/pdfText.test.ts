// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

import { renderPdfPageToJpeg } from './pdfText';

function pdfDoc(numPages: number, page: any = {}) {
    return {
        numPages,
        getPage: vi.fn(async () => ({
            getViewport: vi.fn(({ scale }) => ({ width: 2560 * scale, height: 1440 * scale })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            ...page,
        })),
    } as any;
}

function mockCanvas(toDataURL: ReturnType<typeof vi.fn>) {
    const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({})),
        toDataURL,
    } as any as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    return canvas;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('renderPdfPageToJpeg', () => {
    it('returns null before clamping when the document has zero pages', async () => {
        const doc = pdfDoc(0);

        await expect(renderPdfPageToJpeg(doc, 1)).resolves.toBeNull();

        expect(doc.getPage).not.toHaveBeenCalled();
    });

    it('renders at jargon image dimensions and returns bare jpeg base64', async () => {
        const toDataURL = vi.fn(() => `data:image/jpeg;base64,${'A'.repeat(100)}`);
        const canvas = mockCanvas(toDataURL);
        const doc = pdfDoc(10);

        const result = await renderPdfPageToJpeg(doc, 999);

        expect(result).toBe('A'.repeat(100));
        expect(doc.getPage).toHaveBeenCalledWith(10);
        expect(canvas.width).toBe(1280);
        expect(canvas.height).toBe(720);
        expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
    });

    it('retries at lower quality when the first jpeg does not validate', async () => {
        const toDataURL = vi.fn()
            .mockReturnValueOnce('data:,')
            .mockReturnValueOnce(`data:image/jpeg;base64,${'A'.repeat(100)}`);
        mockCanvas(toDataURL);

        await expect(renderPdfPageToJpeg(pdfDoc(1), 1)).resolves.toBe('A'.repeat(100));

        expect(toDataURL).toHaveBeenNthCalledWith(1, 'image/jpeg', 0.7);
        expect(toDataURL).toHaveBeenNthCalledWith(2, 'image/jpeg', 0.5);
    });

    it('returns null when both jpeg encode attempts throw or validate to null', async () => {
        mockCanvas(vi.fn()
            .mockImplementationOnce(() => { throw new Error('tainted'); })
            .mockReturnValueOnce('data:image/png;base64,QUJDRA=='));

        await expect(renderPdfPageToJpeg(pdfDoc(1), 1)).resolves.toBeNull();
    });

    it('returns null for missing canvas context and render failures', async () => {
        vi.spyOn(document, 'createElement').mockReturnValue({
            width: 0,
            height: 0,
            getContext: vi.fn(() => null),
        } as any);
        await expect(renderPdfPageToJpeg(pdfDoc(1), 1)).resolves.toBeNull();

        mockCanvas(vi.fn(() => `data:image/jpeg;base64,${'A'.repeat(100)}`));
        await expect(renderPdfPageToJpeg(pdfDoc(1, {
            render: vi.fn(() => ({ promise: Promise.reject(new Error('render failed')) })),
        }), 1)).resolves.toBeNull();
    });
});
