import { GoogleGenAI } from '@google/genai';
import { redis } from '../lib/redis.js';

/**
 * PROTOTYPE — "Podcast Factor Monitor" data source.
 *
 * Goal: pull the latest post(s) from an investment podcast's Patreon, then use
 * Gemini to extract the macro/market *factors* the host is currently
 * emphasizing and map each one to a data series this app already tracks.
 *
 * Reality check on Patreon (see README / chat): the Patreon v2 API is designed
 * for *creators* reading their own campaign. A patron token does NOT cleanly
 * expose the full body of patron-only posts. So this endpoint ATTEMPTS the real
 * API when a token is configured, but always degrades gracefully to a bundled
 * sample post so the prototype renders end-to-end without secrets.
 */

const CACHE_KEY = 'patreon_factor_monitor_v1';
const CACHE_TTL = 60 * 30; // 30 min

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

// Symbols this app already fetches — the AI is constrained to map factors onto
// these so the UI can render a live value next to each factor.
const TRACKED_SYMBOLS = [
    { symbol: '^GSPC', label: 'S&P 500', kind: 'market' },
    { symbol: '^IXIC', label: 'Nasdaq Composite', kind: 'market' },
    { symbol: '^DJI', label: 'Dow Jones', kind: 'market' },
    { symbol: '^VIX', label: 'VIX (volatility / fear)', kind: 'market' },
    { symbol: 'DX-Y.NYB', label: 'US Dollar Index (DXY)', kind: 'market' },
    { symbol: 'GC=F', label: 'Gold', kind: 'market' },
    { symbol: 'CL=F', label: 'Crude Oil', kind: 'market' },
    { symbol: 'BTC-USD', label: 'Bitcoin', kind: 'market' },
    { symbol: 'ETH-USD', label: 'Ethereum', kind: 'market' },
    { symbol: '^HSI', label: 'Hang Seng', kind: 'market' },
    { symbol: '^N225', label: 'Nikkei 225', kind: 'market' },
    { symbol: 'CPIAUCSL', label: 'CPI (headline inflation)', kind: 'macro' },
    { symbol: 'CPILFESL', label: 'Core CPI', kind: 'macro' },
    { symbol: 'PPIFIS', label: 'PPI (producer inflation)', kind: 'macro' },
    { symbol: 'GDPC1', label: 'Real GDP (growth)', kind: 'macro' },
    { symbol: 'GDPNOW', label: 'GDPNow nowcast', kind: 'macro' },
];

interface PostRaw {
    title: string;
    content: string;
    url: string;
    publishedAt: string;
}

interface Factor {
    label: string;
    category: 'Liquidity' | 'Inflation' | 'Growth' | 'Breadth' | 'Valuation' | 'Sentiment' | 'Other';
    rationale: string;
    symbol: string | null; // one of TRACKED_SYMBOLS or null when not directly trackable
}

// ---------------------------------------------------------------------------
// Sample content — a plausible investment-podcast thesis, used when the live
// Patreon fetch is unavailable so the prototype is always demonstrable.
// ---------------------------------------------------------------------------
const SAMPLE_POST: PostRaw = {
    title: 'Weekly Note: Liquidity is still the tide',
    url: 'https://www.patreon.com/posts/sample',
    publishedAt: new Date().toISOString(),
    content: `My core view hasn't changed: this is a liquidity-driven tape. Keep your eye
on the dollar (DXY) — every risk-on leg this year has lined up with the dollar rolling over.
Real yields matter more than headline CPI right now, but core inflation staying sticky is the
single biggest threat to the melt-up, so I'm watching Core CPI closely. Gold breaking out
alongside Bitcoin tells me the debasement trade is alive. Finally, watch the VIX — complacency
is high and I want to see how fast fear spikes on any growth scare. Growth itself (GDPNow) is
holding up, which keeps me constructive for now.`,
};

function stripHtml(html: string): string {
    return (html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchPatreonPosts(token: string, campaignId: string | undefined): Promise<PostRaw[]> {
    const headers = { Authorization: `Bearer ${token}` };

    // Resolve campaign id if not provided (works for creator tokens).
    let cid = campaignId;
    if (!cid) {
        const r = await fetch(`${PATREON_API}/campaigns`, { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`campaigns lookup failed: ${r.status}`);
        const j = await r.json();
        cid = j?.data?.[0]?.id;
        if (!cid) throw new Error('no campaign found for this token');
    }

    const fields = 'fields%5Bpost%5D=title,content,url,published_at';
    const url = `${PATREON_API}/campaigns/${cid}/posts?${fields}&page%5Bcount%5D=5&sort=-published_at`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`posts fetch failed: ${r.status}`);
    const j = await r.json();
    const data: any[] = j?.data || [];
    if (data.length === 0) throw new Error('no posts returned');

    return data.map((p) => ({
        title: p.attributes?.title || 'Untitled post',
        content: stripHtml(p.attributes?.content || ''),
        url: p.attributes?.url || `https://www.patreon.com/posts/${p.id}`,
        publishedAt: p.attributes?.published_at || new Date().toISOString(),
    }));
}

// Keyword heuristic used when no Gemini key is available.
function heuristicFactors(text: string): Factor[] {
    const t = text.toLowerCase();
    const rules: Array<{ test: RegExp; factor: Factor }> = [
        { test: /liquidit|balance sheet|m2|money supply|qt|qe/, factor: { label: 'Liquidity', category: 'Liquidity', rationale: 'Host frames the tape as liquidity-driven.', symbol: null } },
        { test: /dollar|dxy|usd/, factor: { label: 'US Dollar (DXY)', category: 'Liquidity', rationale: 'Dollar direction gates risk appetite.', symbol: 'DX-Y.NYB' } },
        { test: /real yield|rates|10-year|10y|treasur/, factor: { label: 'Real yields / rates', category: 'Liquidity', rationale: 'Rates emphasized over headline inflation.', symbol: null } },
        { test: /core cpi|sticky inflation|inflation/, factor: { label: 'Core inflation', category: 'Inflation', rationale: 'Sticky core inflation is the key risk.', symbol: 'CPILFESL' } },
        { test: /gold/, factor: { label: 'Gold (debasement)', category: 'Sentiment', rationale: 'Gold breakout cited as debasement hedge.', symbol: 'GC=F' } },
        { test: /bitcoin|btc|crypto/, factor: { label: 'Bitcoin (debasement)', category: 'Sentiment', rationale: 'Crypto cited alongside gold.', symbol: 'BTC-USD' } },
        { test: /vix|volatilit|fear|complacen/, factor: { label: 'Volatility (VIX)', category: 'Sentiment', rationale: 'Watching how fast fear spikes.', symbol: '^VIX' } },
        { test: /gdp|growth|recession/, factor: { label: 'Growth (GDPNow)', category: 'Growth', rationale: 'Growth holding up keeps host constructive.', symbol: 'GDPNOW' } },
    ];
    const out: Factor[] = [];
    for (const r of rules) if (r.test.test(t)) out.push(r.factor);
    return out;
}

async function extractFactorsWithAI(ai: GoogleGenAI, post: PostRaw): Promise<Factor[] | null> {
    const symbolList = TRACKED_SYMBOLS.map((s) => `${s.symbol} = ${s.label}`).join('\n');
    const prompt = `You analyze an investment podcast host's note and extract the MACRO/MARKET FACTORS
he is currently emphasizing as things to monitor.

POST TITLE: ${post.title}
POST BODY:
${post.content.slice(0, 4000)}

TRACKABLE SYMBOLS (map a factor to one ONLY if it clearly corresponds, else null):
${symbolList}

Return STRICT JSON:
{
  "factors": [
    {
      "label": "short factor name (max 5 words)",
      "category": "one of: Liquidity, Inflation, Growth, Breadth, Valuation, Sentiment, Other",
      "rationale": "one sentence on why the host emphasizes it",
      "symbol": "one tracked symbol or null"
    }
  ]
}
Extract 3-7 factors. JSON only.`;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: 'application/json' },
        });
        const parsed = JSON.parse(result.text || '{}');
        if (!Array.isArray(parsed.factors)) return null;
        const valid = new Set(TRACKED_SYMBOLS.map((s) => s.symbol));
        return parsed.factors.slice(0, 7).map((f: any): Factor => ({
            label: String(f.label || 'Factor').slice(0, 60),
            category: ['Liquidity', 'Inflation', 'Growth', 'Breadth', 'Valuation', 'Sentiment', 'Other'].includes(f.category) ? f.category : 'Other',
            rationale: String(f.rationale || '').slice(0, 200),
            symbol: f.symbol && valid.has(f.symbol) ? f.symbol : null,
        }));
    } catch (e: any) {
        console.error('AI factor extraction failed:', e?.message);
        return null;
    }
}

export default async function handler(req: any, res: any) {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';

        const authHeader = req.headers.authorization;
        const customGeminiKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const usingCustomKey = !!customGeminiKey && customGeminiKey !== 'null' && customGeminiKey !== 'undefined';

        // Serve cache (skip when a per-request Gemini key is supplied so the user
        // can re-extract factors with their own key).
        if (redis && !forceRefresh && !usingCustomKey) {
            const cached: any = await redis.get(CACHE_KEY);
            if (cached) {
                const payload = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.status(200).json({ ...payload, source: `${payload.source} (cache)` });
            }
        }

        // 1. Try the real Patreon API, fall back to the bundled sample.
        let posts: PostRaw[];
        let source: string;
        let note: string | undefined;
        const token = process.env.PATREON_ACCESS_TOKEN;
        if (token) {
            try {
                posts = await fetchPatreonPosts(token, process.env.PATREON_CAMPAIGN_ID);
                source = 'patreon-live';
            } catch (e: any) {
                posts = [SAMPLE_POST];
                source = 'sample';
                note = `Patreon fetch failed (${e?.message}); showing sample so the prototype still renders.`;
            }
        } else {
            posts = [SAMPLE_POST];
            source = 'sample';
            note = 'No PATREON_ACCESS_TOKEN configured — showing a sample post. Set the token to attempt the live Patreon API.';
        }

        const latest = posts[0];

        // 2. Extract factors (AI when possible, heuristic otherwise).
        const geminiKey = usingCustomKey ? customGeminiKey! : process.env.GEMINI_API_KEY;
        let factors: Factor[] | null = null;
        let extraction = 'heuristic';
        if (geminiKey) {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            factors = await extractFactorsWithAI(ai, latest);
            if (factors && factors.length) extraction = 'ai';
        }
        if (!factors || factors.length === 0) {
            factors = heuristicFactors(`${latest.title} ${latest.content}`);
            extraction = 'heuristic';
        }

        const payload = {
            success: true,
            timestamp: new Date().toISOString(),
            source,
            note,
            extraction,
            post: {
                title: latest.title,
                excerpt: latest.content.slice(0, 600),
                url: latest.url,
                publishedAt: latest.publishedAt,
            },
            factors,
            trackedSymbols: TRACKED_SYMBOLS,
        };

        if (redis && !usingCustomKey) {
            await redis.set(CACHE_KEY, JSON.stringify(payload), { ex: CACHE_TTL });
        }

        return res.status(200).json(payload);
    } catch (error: any) {
        console.error('Patreon factor API error:', error);
        return res.status(500).json({ success: false, error: error.message, message: 'Failed to build factor monitor.' });
    }
}
