import { getNimApiKeys, callNim, NIM_TEXT_MODELS, NIM_VISION_MODELS } from '../lib/nim.js';

interface JargonTerm {
    term: string;
    explanation: string;
}

const IMAGE_BASE64_MIN_LEN = 100;
const IMAGE_BASE64_MAX_LEN = 3_000_000;

function parseBody(body: any): any {
    if (typeof body !== 'string') return body;
    try {
        return JSON.parse(body);
    } catch {
        return {};
    }
}

function sanitizeTerms(payload: any): JargonTerm[] {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.terms)) return [];
    return payload.terms
        .filter((entry: any) => entry && typeof entry === 'object')
        .map((entry: any) => ({
            term: typeof entry.term === 'string' ? entry.term.trim().slice(0, 80) : '',
            explanation: typeof entry.explanation === 'string' ? entry.explanation.trim().slice(0, 200) : '',
        }))
        .filter((entry: JargonTerm) => entry.term && entry.explanation)
        .slice(0, 4);
}

function validateImageBase64(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    if (value.length < IMAGE_BASE64_MIN_LEN || value.length > IMAGE_BASE64_MAX_LEN) return null;
    if (value.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(value)) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    return value;
}

function buildJargonMessages(
    input: { text: string } | { imageBase64: string },
    lang: 'en' | 'zh-TW'
): unknown[] {
    const outputLanguage = lang === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'English';
    const prompt = 'text' in input
        ? `You assist a live financial-markets presentation. From the slide text below, identify up to 4
technical financial terms (jargon) that a general business audience may not know.
For each, give a plain-language explanation of at most 25 words, written in
${outputLanguage}. The term itself should be kept
in its original language as it appears on the slide.
Only include genuinely technical terms (e.g. duration, basis point, contango, EBITDA margin) —
skip common words, company names, and numbers. If there is no jargon, return an empty list.

SLIDE TEXT:
${input.text}

OUTPUT (valid JSON only): { "terms": [ { "term": "...", "explanation": "..." } ] }`
        : `You assist a live financial-markets presentation. From the slide IMAGE, read the visible text and identify up to 4
technical financial terms (jargon) that a general business audience may not know.
For each, give a plain-language explanation of at most 25 words, written in
${outputLanguage}. The term itself should be kept
in its original language as it appears on the slide.
Only include genuinely technical terms (e.g. duration, basis point, contango, EBITDA margin) —
skip common words, company names, and numbers. If there is no jargon, return an empty list.

OUTPUT (valid JSON only): { "terms": [ { "term": "...", "explanation": "..." } ] }`;
    return 'text' in input
        ? [{ role: 'user', content: prompt }]
        : [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${input.imageBase64}` } },
                { type: 'text', text: prompt },
            ],
        }];
}

export default async function handler(req: any, res: any) {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const body = parseBody(req.body);
        const rawText = body?.text;
        const validText = typeof rawText === 'string' && rawText.trim().length > 0;
        const imageBase64 = validText ? null : validateImageBase64(body?.imageBase64);
        if (!validText && !imageBase64) {
            return res.status(400).json({ success: false, error: 'Missing text or image' });
        }

        const requestedLang = body?.lang;
        const lang: 'en' | 'zh-TW' = requestedLang === 'en' || requestedLang === 'zh-TW' ? requestedLang : 'en';
        const input = validText
            ? { text: rawText.slice(0, 6000) }
            : { imageBase64 };
        const apiKeys = getNimApiKeys();

        if (apiKeys.length === 0) {
            return res.status(503).json({ success: false, error: 'No AI API key configured' });
        }

        const models = 'text' in input ? NIM_TEXT_MODELS : NIM_VISION_MODELS;
        let raw: string;
        try {
            raw = await callNim(apiKeys, models, buildJargonMessages(input, lang), 900, { reasoningEffort: 'low' });
        } catch (error) {
            console.warn('Jargon generation failed:', error);
            return res.status(502).json({ success: false, error: 'AI processing failed' });
        }

        let parsed: any;
        try {
            parsed = JSON.parse(raw || '{}');
        } catch {
            return res.status(200).json({ success: true, terms: [] });
        }

        return res.status(200).json({ success: true, terms: sanitizeTerms(parsed) });
    } catch (error) {
        console.error('Jargon API Error:', error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Failed to process' });
        }
    }
}
