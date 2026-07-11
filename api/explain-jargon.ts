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
        : 'Read ALL text visible in this slide IMAGE, then identify';
    // Vision models grab table codes (B12, X03#) as "terms" unless told where
    // jargon actually lives — inside fund names, headers and labels (measured
    // 2026-07-11: without this guidance llama returned 4 junk codes, with it
    // 3-4 correct terms on the same slide).
    const imageGuidance = 'text' in input ? '' : `

WHERE TO LOOK: jargon usually hides INSIDE longer phrases — fund names, headers,
column labels, footnotes. Example: the fund name "美元貨幣市場基金 A類別（累積）"
contains the jargon 貨幣市場基金, A類別 and 累積.
NEVER pick: fund/ticker codes (like B12, X03#), row numbers, percentages, or dates.`;
    const rules = `You assist a live financial-markets presentation. ${source} up to 4
technical financial terms (jargon) that a general business audience may not know.${imageGuidance}

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

// Image input is a SINGLE vision call. A serial transcribe-then-extract chain
// was tried (PR #15) and reverted: NIM vision latency swings 16-60s+ on the
// same payload, so two serial vision-budget calls blew every latency window
// (measured 2026-07-11: full transcription >60s; requests hit 41-100s and the
// card never appeared). Term quality is handled by prompt guidance in
// buildJargonMessages instead. 50s per-attempt timeout: a 25s abort killed
// slow-but-successful vision runs (measured 42.6s success on a real slide).
const VISION_TIMEOUT_MS = 50_000;

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
            // Vision models race in parallel: /present auto-advances every 45s,
            // and a serial llama(50s timeout)->mistral chain measured 67.8s —
            // slower than the slide dwell, so the card never showed. Racing
            // makes latency the FASTEST model (16-25s typical) instead of the
            // sum; the loser's request is simply dropped.
            raw = 'text' in input
                ? await callNim(apiKeys, NIM_TEXT_MODELS, buildJargonMessages(input, lang), 900, { reasoningEffort: 'low' })
                : await Promise.any(NIM_VISION_MODELS.map(model =>
                    callNim(apiKeys, [model], buildJargonMessages(input, lang), 900, { timeoutMs: VISION_TIMEOUT_MS })
                ));
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
