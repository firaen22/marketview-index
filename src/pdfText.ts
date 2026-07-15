import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// @ts-ignore — Vite ?url import
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractJargonImageBase64, jargonImageDims } from './jargon';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

export const PDF_LOAD_TIMEOUT_MS = 30_000;

export async function loadPdf(url: string, timeoutMs = PDF_LOAD_TIMEOUT_MS): Promise<PDFDocumentProxy> {
    const task = pdfjsLib.getDocument(url);
    let timeout: number | null = null;
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => {
                task.destroy();
                reject(new Error('PDF load timed out'));
            }, timeoutMs);
        });
        return await Promise.race([task.promise, timeoutPromise]);
    } finally {
        if (timeout !== null) window.clearTimeout(timeout);
    }
}

export async function extractPdfPageText(doc: PDFDocumentProxy, page: number): Promise<string> {
    try {
        const pageNum = Math.max(1, Math.min(doc.numPages, Math.trunc(page)));
        const pdfPage = await doc.getPage(pageNum);
        const content = await pdfPage.getTextContent();
        return content.items
            .map((item: any) => typeof item.str === 'string' ? item.str : '')
            .join(' ')
            .trim();
    } catch {
        return '';
    }
}

function encodeJpegBase64(canvas: HTMLCanvasElement, quality: number): string | null {
    try {
        return extractJargonImageBase64(canvas.toDataURL('image/jpeg', quality));
    } catch {
        return null;
    }
}

export async function renderPdfPageToJpeg(doc: PDFDocumentProxy, page: number): Promise<string | null> {
    if (!(doc.numPages > 0)) return null;
    try {
        const pageNum = Math.max(1, Math.min(doc.numPages, Math.trunc(page)));
        const pdfPage = await doc.getPage(pageNum);
        const sourceViewport = pdfPage.getViewport({ scale: 1 });
        const target = jargonImageDims(sourceViewport.width, sourceViewport.height);
        const scale = sourceViewport.width > 0 ? target.width / sourceViewport.width : 1;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        await pdfPage.render({ canvasContext: context, canvas, viewport }).promise;
        return encodeJpegBase64(canvas, 0.7) ?? encodeJpegBase64(canvas, 0.5);
    } catch {
        return null;
    }
}
