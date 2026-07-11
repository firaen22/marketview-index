export interface JargonTerm {
    term: string;
    explanation: string;
}

export const JARGON_MIN_TEXT_LEN = 40;
export const JARGON_MAX_TEXT_LEN = 6000;

export function jargonCacheKey(pdfUrl: string, page: number, lang: 'en' | 'zh-TW'): string {
    return `${pdfUrl}#${page}#${lang}`;
}

export function isJargonEligible(text: string): boolean {
    return typeof text === 'string' && text.trim().length >= JARGON_MIN_TEXT_LEN;
}

export function prepareJargonText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').slice(0, JARGON_MAX_TEXT_LEN);
}

export function parseJargonResponse(payload: unknown): JargonTerm[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const data = payload as { success?: unknown; terms?: unknown };
    if (data.success !== true || !Array.isArray(data.terms)) return [];

    return data.terms
        .filter((entry): entry is { term: unknown; explanation: unknown } => !!entry && typeof entry === 'object')
        .map(entry => ({
            term: typeof entry.term === 'string' ? entry.term.trim().slice(0, 80) : '',
            explanation: typeof entry.explanation === 'string' ? entry.explanation.trim().slice(0, 200) : '',
        }))
        .filter(entry => entry.term.length > 0 && entry.explanation.length > 0)
        .slice(0, 4);
}
