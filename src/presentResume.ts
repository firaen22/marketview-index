export type PresentView = 'slide' | 'index' | 'heatmap';
export interface PresentResume { view: PresentView; pdfPage: number; slideUpdatedAt: number }

export function parsePresentResume(value: unknown): PresentResume | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    const obj = value as Record<string, unknown>;
    const view = obj.view;
    const pdfPage = obj.pdfPage;
    const slideUpdatedAt = obj.slideUpdatedAt;

    if (typeof view !== 'string' || !['slide', 'index', 'heatmap'].includes(view)) {
        return null;
    }
    if (typeof pdfPage !== 'number' || !isFinite(pdfPage) || !Number.isInteger(pdfPage) || pdfPage < 1) {
        return null;
    }
    if (typeof slideUpdatedAt !== 'number' || !isFinite(slideUpdatedAt) || slideUpdatedAt < 0) {
        return null;
    }
    return { view: view as PresentView, pdfPage, slideUpdatedAt };
}

export function resolvePresentResume(saved: PresentResume | null, currentSlideUpdatedAt: number): { view: PresentView; pdfPage: number } {
    if (!saved) {
        return { view: 'slide', pdfPage: 1 };
    }
    if (saved.slideUpdatedAt !== currentSlideUpdatedAt) {
        return { view: 'slide', pdfPage: 1 };
    }
    return { view: saved.view, pdfPage: saved.pdfPage };
}
