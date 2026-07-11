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
            explanation: typeof entry.explanation === 'string' ? entry.explanation.trim().slice(0, 240) : '',
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
    const lengthRule = lang === 'zh-TW' ? '50 個中文字' : '30 words';
    const source = 'text' in input
        ? 'From the slide text below, identify'
        : 'From the slide IMAGE, read the visible text and identify';
    const rules = `You assist a live financial-markets presentation. ${source} up to 4
technical financial terms (jargon) that a general business audience may not know.

For each term, write an explanation in ${outputLanguage} that:
- uses plain everyday language a viewer with no finance background instantly understands — never
  explain jargon with more jargon, and never just restate the term
- where natural, anchors the idea with a concrete number, comparison, or everyday analogy
  (e.g. "1 basis point = 0.01%, so 50 basis points is half a percent")
- is at most ${lengthRule}

Keep the term itself in its original language as it appears on the slide, and list the most
important term first.
Only include genuinely technical terms (e.g. duration, basis point, contango, EBITDA margin) —
skip common words, company names, and numbers. If there is no jargon, return an empty list.`;
    const output = `OUTPUT (valid JSON only): { "terms": [ { "term": "...", "explanation": "..." } ] }`;
    const prompt = 'text' in input
        ? `${rules}

SLIDE TEXT:
${input.text}

${output}`
        : `${rules}

${output}`;
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

// Vision models under-extract jargon when asked directly (1 term where the
// text model finds 4 on the same slide, measured live 2026-07-11), so image
// input is handled in two steps: a vision model transcribes the slide text,
// then the stronger text model extracts jargon from the transcript. Returns ''
// when nothing useful comes back so the caller can fall back to single-shot
// vision extraction.
async function transcribeSlideImage(apiKeys: string[], imageBase64: string): Promise<string> {
    const messages = [{
        role: 'user',
        content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            {
                type: 'text',
                text: 'Transcribe ALL text visible in this slide image, in reading order, exactly as written. OUTPUT (valid JSON only): { "text": "..." }',
            },
        ],
    }];
    const raw = await callNim(apiKeys, NIM_VISION_MODELS, messages, 1200, { reasoningEffort: 'low' });
    try {
        const parsed = JSON.parse(raw || '{}');
        return typeof parsed?.text === 'string' ? parsed.text.trim() : '';
    } catch {
        return '';
    }
}

// Transcribe-then-extract, falling back to the old single-shot vision
// extraction when transcription yields nothing or the text model is down —
// an image request must not fail while the legacy path could still succeed.
async function extractFromImage(apiKeys: string[], imageBase64: string, lang: 'en' | 'zh-TW'): Promise<string> {
    let transcript = '';
    try {
        transcript = await transcribeSlideImage(apiKeys, imageBase64);
    } catch (error) {
        console.warn('Slide transcription failed:', error);
    }
    if (transcript) {
        try {
            return await callNim(
                apiKeys,
                NIM_TEXT_MODELS,
                buildJargonMessages({ text: transcript.slice(0, 6000) }, lang),
                900,
                { reasoningEffort: 'low' }
            );
        } catch (error) {
            console.warn('Jargon extraction from transcript failed:', error);
        }
    }
    return callNim(apiKeys, NIM_VISION_MODELS, buildJargonMessages({ imageBase64 }, lang), 900, { reasoningEffort: 'low' });
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

        let raw: string;
        try {
            raw = 'text' in input
                ? await callNim(apiKeys, NIM_TEXT_MODELS, buildJargonMessages(input, lang), 900, { reasoningEffort: 'low' })
                : await extractFromImage(apiKeys, input.imageBase64, lang);
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
