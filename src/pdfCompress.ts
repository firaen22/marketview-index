import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// @ts-ignore — Vite ?url import
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Shrink an all-raster slide deck before it is uploaded.
 *
 * The decks this exists for are PowerPoint/Keynote PDF exports whose pages are
 * each one full-page bitmap stored losslessly, which is why a ten-slide deck
 * weighs 22 MB and takes minutes to reach the projector over hotel wifi.
 * Re-encoding those bitmaps as JPEG q=0.95 at their native pixel size measured
 * 22.5 MB -> 4.1 MB at PSNR 37-39 dB, with the differences confined to edge
 * ringing invisible at 5x zoom.
 *
 * This is NOT a general PDF compressor and must never become one. Anything that
 * is not exactly "one full-page bitmap per page" — text, vector artwork, a
 * rotated page, transparency, an already-JPEG deck — is returned untouched, and
 * one bad page abandons the whole document. A deck that stays 22 MB is the
 * cheap failure; a blurred, rotated or truncated deck on a stage is not.
 */

export const COMPRESS_MIN_BYTES = 5 * 1024 * 1024;
export const COMPRESS_JPEG_QUALITY = 0.95;
export const COMPRESS_BUDGET_MS = 60_000;
export const COMPRESS_MAX_PAGES = 80;
export const COMPRESS_MAX_PAGE_PIXELS = 30_000_000;

const RAW_SCAN_CHUNK_BYTES = 0x8000;

type OpsTable = Record<string, number | undefined>;
type PDFOperatorList = Awaited<ReturnType<PDFPageProxy['getOperatorList']>>;
type JpegPageGeometry = { widthPt: number; heightPt: number; widthPx: number; heightPx: number };
type JpegPage = JpegPageGeometry & { jpeg: Uint8Array };

/**
 * Doc-level disqualifiers, found by scanning raw bytes rather than by asking
 * pdfjs — it hides the filter chain behind its decoder, and these only ever
 * need a yes/no.
 *
 *   /DCTDecode, /JPXDecode  already lossy; re-encoding is generation-2 loss
 *   /SMask                  transparency, which JPEG cannot carry
 *   /Encrypt                pdfjs may block on a password callback
 *
 * Scanned in chunks with a carry, so a marker straddling a chunk boundary is
 * still found. latin1 semantics (one char per byte) keep binary streams from
 * merging or splitting an ASCII marker the way a UTF-8 decode could.
 */
function containsForbiddenBytes(data: Uint8Array): boolean {
    const needles = ['/DCTDecode', '/JPXDecode', '/SMask', '/Encrypt'];
    const carryLength = Math.max(...needles.map(needle => needle.length)) - 1;
    let carry = '';
    for (let start = 0; start < data.length; start += RAW_SCAN_CHUNK_BYTES) {
        const chunk = data.subarray(start, start + RAW_SCAN_CHUNK_BYTES);
        const text = carry + String.fromCharCode(...chunk);
        if (needles.some(needle => text.includes(needle))) return true;
        carry = text.slice(-carryLength);
    }
    return false;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', COMPRESS_JPEG_QUALITY);
    });
}

/**
 * A page qualifies only if it is exactly one full-page bitmap, drawn last.
 *
 * Anything painted BEFORE a full-page opaque image is hidden underneath it and
 * safe to discard — that is why a real export's background fill is allowed.
 * Anything painted after it would be lost, so it disqualifies the page.
 *
 * Text is checked two ways because neither alone is enough: `getTextContent()`
 * misses nothing extractable, but outlined type extracts as zero characters, so
 * a page with no image at all is treated as vector artwork and refused.
 */
function qualifyPage(page: PDFPageProxy, operatorList: PDFOperatorList, ops: OpsTable): JpegPageGeometry | null {
    // Cheap structural checks first — they cost nothing and reject the shapes
    // whose geometry we would have to reproduce and could get wrong.
    if (page.rotate !== 0) return null;
    const view = page.view;
    if (!Array.isArray(view) || view.length !== 4
        || view[0] !== 0 || view[1] !== 0
        || !Number.isFinite(view[2]) || !Number.isFinite(view[3])
        || !(view[2] > 0) || !(view[3] > 0)) return null;
    const widthPt = view[2];
    const heightPt = view[3];

    const textOps = new Set([
        ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText,
    ]);
    const unsupportedOps = new Set([
        ops.paintFormXObject, ops.paintFormXObjectBegin, ops.paintFormXObjectEnd,
        ops.paintImageMaskXObject, ops.paintImageMaskXObjectGroup, ops.paintImageMaskXObjectRepeat,
        ops.paintInlineImageXObject, ops.paintInlineImageXObjectGroup, ops.paintImageXObjectRepeat,
        ops.paintSolidColorImageMask, ops.shadingFill, ops.setGState, ops.group,
        ops.beginGroup, ops.endGroup,
    ]);
    // Bookkeeping that paints nothing, so it may legally follow the image.
    const safeAfterImageOps = new Set([ops.restore, ops.dependency, ops.endText, ops.save]);
    const imageOps = new Set([ops.paintImageXObject, ops.paintJpegXObject]);

    let imageCount = 0;
    let imageIndex = -1;
    for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        if (textOps.has(op) || unsupportedOps.has(op)) return null;
        if (imageOps.has(op)) {
            imageCount++;
            imageIndex = i;
        }
    }
    if (imageCount !== 1) return null;
    for (let i = imageIndex + 1; i < operatorList.fnArray.length; i++) {
        if (!safeAfterImageOps.has(operatorList.fnArray[i])) return null;
    }

    // pdfjs puts the source bitmap's NATIVE pixel size in the operator args, so
    // we never resolve the image object to learn it. Rendering at the 72-dpi
    // default viewport instead would ship blurrier slides than we started with.
    const args = operatorList.argsArray[imageIndex] as [string, number, number] | undefined;
    const widthPx = args?.[1];
    const heightPx = args?.[2];
    if (!Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx)
        || (widthPx as number) <= 0 || (heightPx as number) <= 0
        || (widthPx as number) * (heightPx as number) > COMPRESS_MAX_PAGE_PIXELS) return null;

    return { widthPt, heightPt, widthPx: widthPx as number, heightPx: heightPx as number };
}

function textBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function assemblePdf(pages: JpegPage[]): Uint8Array {
    const parts: Uint8Array[] = [];
    const offsets: number[] = [0];
    let byteLength = 0;
    const add = (part: Uint8Array | string) => {
        const bytes = typeof part === 'string' ? textBytes(part) : part;
        parts.push(bytes);
        byteLength += bytes.byteLength;
    };
    const object = (number: number, body: Uint8Array | string) => {
        offsets[number] = byteLength;
        add(`${number} 0 obj\n`);
        add(body);
        add('\nendobj\n');
    };

    add(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 255, 255, 255, 255, 10]));
    const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
    for (let i = 0; i < pages.length; i++) {
        const pageObject = 3 + i * 3;
        const contentObject = pageObject + 1;
        const imageObject = pageObject + 2;
        const page = pages[i];
        const content = `q\n${page.widthPt} 0 0 ${page.heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
        const contentBytes = textBytes(content);
        object(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
        object(contentObject, `<< /Length ${contentBytes.byteLength} >>\nstream\n${content}endstream`);
        offsets[imageObject] = byteLength;
        add(`${imageObject} 0 obj\n`);
        add(`<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`);
        add(page.jpeg);
        add('\nendstream\nendobj\n');
    }

    const xrefOffset = byteLength;
    add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (let i = 1; i < offsets.length; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const output = new Uint8Array(byteLength);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
    }
    return output;
}

export async function maybeCompressPdf(file: File): Promise<File> {
    if (!Number.isSafeInteger(file.size) || file.size < COMPRESS_MIN_BYTES) return file;
    let doc: PDFDocumentProxy | null = null;
    const deadline = performance.now() + COMPRESS_BUDGET_MS;
    try {
        const data = new Uint8Array(await file.arrayBuffer());
        if (containsForbiddenBytes(data)) return file;

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;
        const loadingTask = pdfjsLib.getDocument({ data, password: () => { throw new Error('encrypted'); } } as any);
        doc = await loadingTask.promise;
        if (doc.numPages < 1 || doc.numPages > COMPRESS_MAX_PAGES) return file;

        const pages: JpegPage[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
            if (performance.now() > deadline) return file;
            const page = await doc.getPage(pageNumber);
            try {
                const textContent = await page.getTextContent();
                if (textContent.items.length > 0) return file;
                const operatorList = await page.getOperatorList();
                const qualified = qualifyPage(page, operatorList, pdfjsLib.OPS as OpsTable);
                if (!qualified) return file;

                const viewport = page.getViewport({ scale: qualified.widthPx / qualified.widthPt });
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                if (!(canvas.width > 0) || !(canvas.height > 0)
                    || canvas.width * canvas.height > COMPRESS_MAX_PAGE_PIXELS) return file;
                try {
                    const context = canvas.getContext('2d');
                    if (!context) return file;
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    await page.render({ canvasContext: context, canvas, viewport }).promise;
                    const blob = await canvasBlob(canvas);
                    if (!blob) return file;
                    const jpeg = new Uint8Array(await blob.arrayBuffer());
                    pages.push({ ...qualified, jpeg });
                } finally {
                    canvas.width = 0;
                    canvas.height = 0;
                }
            } finally {
                page.cleanup();
            }
            if (performance.now() > deadline) return file;
        }

        const output = assemblePdf(pages);
        const validationTask = pdfjsLib.getDocument({ data: output, password: () => { throw new Error('encrypted'); } } as any);
        const validationDoc = await validationTask.promise;
        try {
            if (validationDoc.numPages !== doc.numPages) return file;
        } finally {
            try { await validationDoc.destroy(); } catch {}
        }
        if (output.byteLength >= file.size) return file;
        return new File([output], file.name, { type: 'application/pdf' });
    } catch {
        return file;
    } finally {
        if (doc) {
            try { await doc.destroy(); } catch {}
        }
    }
}
