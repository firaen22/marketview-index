import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// @ts-ignore — Vite ?url import
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
    return pdfjsLib.getDocument(url).promise;
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
