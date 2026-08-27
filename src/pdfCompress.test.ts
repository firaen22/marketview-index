// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// pdfjs is faked so a test can hand back any page shape it likes. The real
// module is exercised end-to-end against the production deck separately; what
// matters here is that every disqualifying shape returns the deck untouched.
const pdfjs = vi.hoisted(() => {
    const OPS = {
        dependency: 1, save: 10, restore: 11, transform: 12, constructPath: 91,
        beginText: 31, endText: 32, setFont: 37, setLeading: 34, setFillRGBColor: 58,
        showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47,
        paintImageXObject: 85, paintJpegXObject: 82, paintFormXObject: 74,
        paintImageMaskXObject: 83, shadingFill: 73, setGState: 70,
    };
    const state: { docs: unknown[]; loadCalls: number } = { docs: [], loadCalls: 0 };
    return {
        state, OPS,
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: vi.fn(() => {
            state.loadCalls += 1;
            const doc = state.docs.shift();
            return { promise: doc instanceof Error ? Promise.reject(doc) : Promise.resolve(doc) };
        }),
    };
});

vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const { maybeCompressPdf, COMPRESS_MIN_BYTES } = await import('./pdfCompress');

// A page of the exact shape a real PowerPoint export produces: an empty text
// block and a background fill, then one full-page bitmap drawn last.
function rasterPage(over: Record<string, unknown> = {}) {
    const { OPS } = pdfjs;
    return {
        rotate: 0,
        view: [0, 0, 960, 540],
        getTextContent: vi.fn(async () => ({ items: [] })),
        getOperatorList: vi.fn(async () => ({
            fnArray: [OPS.transform, OPS.beginText, OPS.setFont, OPS.endText,
                OPS.constructPath, OPS.save, OPS.paintImageXObject, OPS.restore],
            argsArray: [[], [], [], [], [], [], ['img_p0_1', 1672, 941], []],
        })),
        getViewport: vi.fn(() => ({ width: 1672, height: 941 })),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
        cleanup: vi.fn(),
        ...over,
    };
}

function fakeDoc(pages: unknown[]) {
    return {
        numPages: pages.length,
        getPage: vi.fn(async (n: number) => pages[n - 1]),
        destroy: vi.fn(async () => {}),
    };
}

// A deck big enough to be worth compressing, whose bytes contain no
// disqualifying marker.
function deck(size = COMPRESS_MIN_BYTES * 4, body = '%PDF-1.4 /FlateDecode') {
    const file = new File([body], 'deck.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: size });
    file.arrayBuffer = async () => new TextEncoder().encode(body).buffer;
    return file;
}

let toBlobResult: Blob | null;

beforeEach(() => {
    pdfjs.state.docs = [];
    pdfjs.state.loadCalls = 0;
    pdfjs.getDocument.mockClear();
    // A JPEG small enough that the assembled deck always beats the input size.
    toBlobResult = new Blob([new Uint8Array(64)], { type: 'image/jpeg' });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        fillStyle: '', fillRect: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(toBlobResult); };
});

describe('maybeCompressPdf shrinks raster decks and refuses everything else', () => {
    it('compresses an all-raster deck, preserving name, page count and page box', async () => {
        const pages = Array.from({ length: 10 }, () => rasterPage());
        pdfjs.state.docs = [fakeDoc(pages), fakeDoc(pages)]; // load, then self-validation
        const input = deck();

        const out = await maybeCompressPdf(input);

        expect(out).not.toBe(input);
        expect(out.name).toBe('deck.pdf');
        expect(out.size).toBeLessThan(input.size);
        // The self-validation reload is what proves the bytes we wrote parse.
        expect(pdfjs.getDocument).toHaveBeenCalledTimes(2);
        const text = new TextDecoder().decode(await out.arrayBuffer());
        expect(text).toContain('/Count 10');
        expect(text).toContain('/MediaBox [0 0 960 540]');
        expect(text).toContain('/Filter /DCTDecode');
    });

    it('leaves a file below the threshold alone without loading pdfjs at all', async () => {
        const input = deck(COMPRESS_MIN_BYTES - 1);
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it('refuses a deck that already contains JPEG images rather than re-encoding it', async () => {
        // Recompressing /DCTDecode content is generation-2 loss for no real gain.
        const input = deck(COMPRESS_MIN_BYTES * 4, '%PDF-1.4 /DCTDecode');
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it.each([['/SMask'], ['/Encrypt'], ['/JPXDecode']])('refuses a deck containing %s', async marker => {
        const input = deck(COMPRESS_MIN_BYTES * 4, `%PDF-1.4 ${marker}`);
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('finds a disqualifying marker that straddles a chunk boundary', async () => {
        // The scan reads 32 KB at a time; without a carry between chunks a
        // marker split across the seam would be missed and the deck wrongly
        // recompressed.
        const body = 'x'.repeat(0x8000 - 4) + '/DCTDecode';
        const input = deck(COMPRESS_MIN_BYTES * 4, body);
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it('returns a text-bearing deck untouched and never rasterizes it', async () => {
        // Rasterizing text would silently kill the Presenter Copilot's jargon
        // extraction, which reads the deck's text.
        const page = rasterPage({ getTextContent: vi.fn(async () => ({ items: [{ str: 'Q3' }] })) });
        pdfjs.state.docs = [fakeDoc([page])];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(page.render).not.toHaveBeenCalled();
    });

    it('returns a text-free VECTOR page untouched', async () => {
        // Outlined type and vector charts extract as zero text, so "no text"
        // alone is not enough — a page with no image is refused.
        const { OPS } = pdfjs;
        const page = rasterPage({
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.save, OPS.constructPath, OPS.restore],
                argsArray: [[], [], []],
            })),
        });
        pdfjs.state.docs = [fakeDoc([page])];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(page.render).not.toHaveBeenCalled();
    });

    it('refuses a page whose image is not the last thing drawn', async () => {
        // Content painted over the bitmap would be lost.
        const { OPS } = pdfjs;
        const page = rasterPage({
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.save, OPS.paintImageXObject, OPS.constructPath, OPS.restore],
                argsArray: [[], ['img', 1672, 941], [], []],
            })),
        });
        pdfjs.state.docs = [fakeDoc([page])];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
        expect(page.render).not.toHaveBeenCalled();
    });

    it('refuses a rotated page rather than risk placing the raster sideways', async () => {
        pdfjs.state.docs = [fakeDoc([rasterPage({ rotate: 90 })])];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('abandons the WHOLE document when one page fails to encode', async () => {
        // Emitting the 6 pages that worked would put a truncated deck on stage.
        const pages = Array.from({ length: 10 }, () => rasterPage());
        pdfjs.state.docs = [fakeDoc(pages)];
        let calls = 0;
        HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
            calls += 1;
            cb(calls === 7 ? null : new Blob([new Uint8Array(64)]));
        };
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('returns the original when compression would grow the file', async () => {
        const pages = [rasterPage()];
        pdfjs.state.docs = [fakeDoc(pages), fakeDoc(pages)];
        toBlobResult = new Blob([new Uint8Array(COMPRESS_MIN_BYTES * 8)]);
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('returns the original when the assembled bytes fail to re-parse', async () => {
        pdfjs.state.docs = [fakeDoc([rasterPage()]), new Error('bad xref')];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('returns the original when the self-validation page count disagrees', async () => {
        const pages = Array.from({ length: 3 }, () => rasterPage());
        pdfjs.state.docs = [fakeDoc(pages), fakeDoc([rasterPage()])];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('never rejects, whatever throws mid-compression', async () => {
        const page = rasterPage({
            render: vi.fn(() => ({ promise: Promise.reject(new Error('gpu lost')) })),
        });
        pdfjs.state.docs = [fakeDoc([page])];
        const input = deck();
        await expect(maybeCompressPdf(input)).resolves.toBe(input);
    });

    it('returns the original when the document fails to load at all', async () => {
        pdfjs.state.docs = [new Error('InvalidPDFException')];
        const input = deck();
        await expect(maybeCompressPdf(input)).resolves.toBe(input);
    });

    it('refuses a deck longer than the page cap', async () => {
        pdfjs.state.docs = [{ numPages: 5000, getPage: vi.fn(), destroy: vi.fn(async () => {}) }];
        const input = deck();
        expect(await maybeCompressPdf(input)).toBe(input);
    });

    it('destroys the pdfjs document even on a refusal path', async () => {
        const doc = fakeDoc([rasterPage({ rotate: 90 })]);
        pdfjs.state.docs = [doc];
        await maybeCompressPdf(deck());
        expect(doc.destroy).toHaveBeenCalled();
    });
});

describe('the assembled deck survives self-validation and describes itself honestly', () => {
    // Real pdfjs posts `data.buffer` to the worker in the TRANSFER list, which
    // detaches it in this thread. The production mock must do the same or the
    // zero-byte-upload bug is invisible to every test.
    // mockReset restores the implementation vi.fn() was created with, so the
    // detaching stub cannot leak into the tests below it.
    afterEach(() => { pdfjs.getDocument.mockReset(); });

    function detachOnLoad() {
        pdfjs.getDocument.mockImplementation(((options: any) => {
            const data = options?.data;
            if (data instanceof Uint8Array && data.byteLength > 0) {
                structuredClone(data.buffer, { transfer: [data.buffer] });
            }
            pdfjs.state.loadCalls += 1;
            const doc = pdfjs.state.docs.shift();
            return { promise: doc instanceof Error ? Promise.reject(doc) : Promise.resolve(doc) };
        }) as unknown as typeof pdfjs.getDocument);
    }

    it('still returns real compressed bytes when pdfjs transfers the buffer it is handed', async () => {
        detachOnLoad();
        const pages = Array.from({ length: 3 }, () => rasterPage());
        pdfjs.state.docs = [fakeDoc(pages), fakeDoc(pages)];
        const input = deck();

        const out = await maybeCompressPdf(input);

        expect(out).not.toBe(input);
        expect(out.size).toBeGreaterThan(0);
        expect(new TextDecoder().decode(await out.arrayBuffer())).toContain('%PDF-1.4');
    });

    it('declares the rendered canvas height, not the source bitmap height', async () => {
        // 1000x562 on a 960x540pt page: within the aspect tolerance, but the
        // page renders to a 563px-tall canvas. The dictionary must describe the
        // JPEG that was written, not the bitmap it came from.
        const { OPS } = pdfjs;
        const page = rasterPage({
            view: [0, 0, 960, 540],
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.save, OPS.paintImageXObject, OPS.restore],
                argsArray: [[], ['img_p0_1', 1000, 562], []],
            })),
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 960 * scale, height: 540 * scale })),
        });
        const seen: Array<{ width: number; height: number }> = [];
        HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback) {
            seen.push({ width: this.width, height: this.height });
            cb(toBlobResult);
        };
        pdfjs.state.docs = [fakeDoc([page]), fakeDoc([page])];

        const out = await maybeCompressPdf(deck());
        const text = new TextDecoder().decode(await out.arrayBuffer());

        expect(seen).toEqual([{ width: 1000, height: 563 }]);
        expect(text).toContain('/Width 1000 /Height 563');
        expect(text).not.toContain('/Height 562');
    });

    it('refuses a degenerate page box whose aspect arithmetic is not finite', async () => {
        // A sub-point width makes heightPt/widthPt Infinity, and every ratio
        // comparison against Infinity is false — so without a bounds check the
        // aspect and scale tests both wave the page through.
        const { OPS } = pdfjs;
        const page = rasterPage({
            view: [0, 0, Number.MIN_VALUE, 540],
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.save, OPS.paintImageXObject, OPS.restore],
                argsArray: [[], ['img_p0_1', 1672, 941], []],
            })),
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: Number.MIN_VALUE * scale, height: 540 * scale })),
        });
        pdfjs.state.docs = [fakeDoc([page]), fakeDoc([page])];
        const input = deck();

        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.state.loadCalls).toBe(1);
    });

    it('refuses a page-shaped bitmap that is only a small logo', async () => {
        // 160x90 has EXACTLY the 960x540pt page aspect, so the aspect test
        // alone lets it through — and the render scale would then rasterize the
        // whole slide at 160px wide.
        const { OPS } = pdfjs;
        const page = rasterPage({
            view: [0, 0, 960, 540],
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.constructPath, OPS.save, OPS.paintImageXObject, OPS.restore],
                argsArray: [[], [], ['img_p0_1', 160, 90], []],
            })),
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 960 * scale, height: 540 * scale })),
        });
        pdfjs.state.docs = [fakeDoc([page]), fakeDoc([page])];
        const input = deck();

        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.state.loadCalls).toBe(1);
    });

    it('refuses a page whose bitmap does not cover the page', async () => {
        // A portrait A4 scan letterboxed on a 16:9 slide. The render scale comes
        // from the page width, so compressing this would ship every slide at a
        // fraction of the scan's native resolution.
        const { OPS } = pdfjs;
        const page = rasterPage({
            view: [0, 0, 960, 540],
            getOperatorList: vi.fn(async () => ({
                fnArray: [OPS.save, OPS.paintImageXObject, OPS.restore],
                argsArray: [[], ['img_p0_1', 1700, 2200], []],
            })),
            getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 960 * scale, height: 540 * scale })),
        });
        // Two docs queued so a refusal cannot be an artifact of the validation
        // load finding an empty queue; loadCalls proves we never got that far.
        pdfjs.state.docs = [fakeDoc([page]), fakeDoc([page])];
        const input = deck();

        expect(await maybeCompressPdf(input)).toBe(input);
        expect(pdfjs.state.loadCalls).toBe(1);
    });
});
