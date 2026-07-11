import { GoogleGenAI } from '@google/genai';

interface JargonTerm {
    term: string;
    explanation: string;
}

const API_KEY_PATTERN = /^[A-Za-z0-9._-]{20,128}$/;

// gemini-1.5-flash is retired; flash-lite has a separate (higher) free-tier
// quota, so it also absorbs quota failures on the primary model.
const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function getServerApiKeys(): string[] {
    return [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK]
        .map(key => (typeof key === 'string' ? key.trim() : ''))
        .filter(key => key.length > 0);
}

function getCustomApiKey(req: any): string | null {
    const authHeader = req.headers.authorization;
    const rawCustomApiKey = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : null;
    return rawCustomApiKey
        && API_KEY_PATTERN.test(rawCustomApiKey)
        && rawCustomApiKey !== 'null'
        && rawCustomApiKey !== 'undefined'
        ? rawCustomApiKey
        : null;
}

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

async function generateJargon(client: GoogleGenAI, model: string, text: string, lang: 'en' | 'zh-TW') {
    const outputLanguage = lang === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'English';
    const prompt = `You assist a live financial-markets presentation. From the slide text below, identify up to 4
technical financial terms (jargon) that a general business audience may not know.
For each, give a plain-language explanation of at most 25 words, written in
${outputLanguage}. The term itself should be kept
in its original language as it appears on the slide.
Only include genuinely technical terms (e.g. duration, basis point, contango, EBITDA margin) —
skip common words, company names, and numbers. If there is no jargon, return an empty list.

SLIDE TEXT:
${text}

OUTPUT (valid JSON only): { "terms": [ { "term": "...", "explanation": "..." } ] }`;

    return client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
    });
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
        if (typeof rawText !== 'string' || rawText.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Missing text' });
        }

        const requestedLang = body?.lang;
        const lang: 'en' | 'zh-TW' = requestedLang === 'en' || requestedLang === 'zh-TW' ? requestedLang : 'en';
        const text = rawText.slice(0, 6000);
        const customApiKey = getCustomApiKey(req);
        const apiKeys = customApiKey ? [customApiKey] : getServerApiKeys();

        if (apiKeys.length === 0) {
            return res.status(503).json({ success: false, error: 'No Gemini API key configured' });
        }

        let result: any = null;
        for (const apiKey of apiKeys) {
            const client = new GoogleGenAI({ apiKey });
            for (const model of MODEL_CHAIN) {
                try {
                    result = await generateJargon(client, model, text, lang);
                    break;
                } catch (error) {
                    console.warn(`Jargon generation failed (model ${model}):`, error);
                }
            }
            if (result) break;
        }
        if (!result) {
            return res.status(502).json({ success: false, error: 'AI processing failed' });
        }

        let parsed: any;
        try {
            parsed = JSON.parse(result.text || '{}');
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
