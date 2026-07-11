import YahooFinance from 'yahoo-finance2';
import { GoogleGenAI } from '@google/genai';
import { redis } from '../lib/redis.js';
import crypto from 'crypto';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const CACHE_KEY = 'global_market_news_v1';
const NEWS_CACHE_TTL = 60 * 15; // 15 minutes in seconds

// 2. Gemini GenAI Setup
// Each env var may hold a single key or several comma-separated keys.
function getServerApiKeys(): string[] {
    return [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK]
        .flatMap(value => (typeof value === 'string' ? value.split(',') : []))
        .map(key => key.trim())
        .filter(key => key.length > 0);
}

// Cache resolved model names to avoid calling models.list() on every request (Issue #16)
const resolvedModelCache: Map<string, { model: string; ts: number }> = new Map();
const MODEL_CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function resolveModel(client: any, cacheKey: string): Promise<string> {
    const cached = resolvedModelCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL) {
        return cached.model;
    }
    let modelName = 'gemini-2.5-flash-lite';
    try {
        const modelListResult: any = await client.models.list();
        const availableModels: string[] = [];
        for await (const m of modelListResult) {
            availableModels.push(m.name.replace('models/', ''));
        }
        const preferred = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
        for (const p of preferred) {
            if (availableModels.includes(p)) {
                modelName = p;
                break;
            }
        }
    } catch (listErr) {
        console.warn('Fallback to gemini-2.5-flash-lite:', listErr);
    }
    if (resolvedModelCache.size >= 50) {
        resolvedModelCache.clear();
    }
    resolvedModelCache.set(cacheKey, { model: modelName, ts: Date.now() });
    return modelName;
}

export default async function handler(req: any, res: any) {
    try {
        // Disable Vercel Edge caching to rely on Redis
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';
        const requestedLang = searchParams.get('lang') || 'en';
        const lang = requestedLang === 'en' || requestedLang === 'zh-TW' ? requestedLang : 'en';

        const CURRENT_CACHE_KEY = lang === 'en' ? CACHE_KEY : `${CACHE_KEY}_${lang}`;
        const returnCachedPayload = (cachedNews: any) => {
            const payload = typeof cachedNews === 'string' ? JSON.parse(cachedNews) : cachedNews;
            return res.status(200).json({ ...payload, source: 'cache' });
        };

        // Check for custom Gemini API Key in Authorization header
        const authHeader = req.headers.authorization;
        const rawCustomApiKey = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const customApiKey = rawCustomApiKey && /^[A-Za-z0-9._-]{20,128}$/.test(rawCustomApiKey) ? rawCustomApiKey : null;

        // Use custom key if provided, otherwise fall back to server key(s)
        const useCustomKey = !!customApiKey && customApiKey !== 'null' && customApiKey !== 'undefined';
        const apiKeys = useCustomKey ? [customApiKey as string] : getServerApiKeys();
        if (useCustomKey) console.log('Using custom Gemini API key from request.');
        const hasAi = apiKeys.length > 0;

        // 1. Try to read from Redis Cache first (only if NO custom key is used)
        let cachedNews: any = redis ? await redis.get(CURRENT_CACHE_KEY) : null;
        if (redis && forceRefresh) {
            const throttleKey = `refresh_throttle_${CURRENT_CACHE_KEY}`;
            const throttled = await redis.get(throttleKey);
            if (throttled && cachedNews) {
                return returnCachedPayload(cachedNews);
            }
            await redis.set(throttleKey, '1', { ex: 60 });
        }

        if (redis && !forceRefresh && !customApiKey) {
            if (cachedNews) {
                return returnCachedPayload(cachedNews);
            }
        }

        // 2. Fetch Fresh News from Yahoo Finance
        console.log('Fetching fresh news from multi-source search...');

        const searchTasks = [
            yahooFinance.search('SPY', { newsCount: 5, quotesCount: 0 }),
            yahooFinance.search('QQQ', { newsCount: 5, quotesCount: 0 }),
            yahooFinance.search('Reuters Bloomberg', { newsCount: 5, quotesCount: 0 }),
            yahooFinance.search('Seeking Alpha Investing.com', { newsCount: 5, quotesCount: 0 })
        ];

        const searchResults = await Promise.all(searchTasks);
        let allNews: any[] = [];
        searchResults.forEach(res => {
            if (res.news) allNews = [...allNews, ...res.news];
        });

        // Deduplicate by UUID
        const seen = new Set();
        const newsItems = allNews.filter(n => {
            if (!n.uuid || seen.has(n.uuid)) return false;
            seen.add(n.uuid);
            return true;
        }).sort((a, b) => {
            const premiumSources = ['Reuters', 'Bloomberg', 'Investing.com', 'Seeking Alpha'];
            const aIsPremium = premiumSources.some(s => a.publisher?.includes(s));
            const bIsPremium = premiumSources.some(s => b.publisher?.includes(s));
            if (aIsPremium && !bIsPremium) return -1;
            if (!aIsPremium && bIsPremium) return 1;
            return 0;
        }).slice(0, 8);

        const isChinese = lang === 'zh-TW';

        // 3. Consolidated AI Processing: Single Request for ALL data
        let processedNews = newsItems.map((article: any, index: number) => {
            const publishedAt = article.providerPublishTime ? new Date(article.providerPublishTime) : new Date();
            const time = isNaN(publishedAt.getTime()) ? new Date().toISOString() : publishedAt.toISOString();
            return {
                id: article.uuid || `news-${index}`,
                title: article.title,
                originalTitle: article.title,
                summary: article.title,
                url: article.link || article.url,
                publisher: article.publisher || "Market News",
                time,
                sentiment: "Neutral" as 'Bullish' | 'Bearish' | 'Neutral'
            };
        });

        let marketSummary = "";

        if (hasAi) {
            const combinedPrompt = `
Analyze the following financial news headlines and provide a consolidated response.

ARTICLE LIST:
${newsItems.map((n: any, i: number) => `${i + 1}. [${n.publisher}] ${n.title}`).join('\n')}

TASK:
1. Provide a 2-sentence market overview in ${isChinese ? 'Traditional Chinese (繁體中文)' : 'English'}.
2. Provide 3 bulleted key highlights in ${isChinese ? 'Traditional Chinese (繁體中文)' : 'English'}.
3. For EACH article above, provide:
   - A short summary (max 25 words) in ${isChinese ? 'Traditional Chinese (繁體中文)' : 'English'}.
   - Sentiment: BULLISH, BEARISH, or NEUTRAL.
   - Professional ${isChinese ? 'Traditional Chinese (繁體中文) translation' : 'English refinement'} of the title.

OUTPUT FORMAT (Valid JSON only):
{
  "pulse": {
    "overview": "...",
    "highlights": ["...", "...", "..."]
  },
  "articles": [
    { "title": "...", "summary": "...", "sentiment": "..." },
    ...
  ]
}
`;

            try {
                // Try each key until one succeeds; each key resolves its own model (cached).
                let result: any = null;
                for (const apiKey of apiKeys) {
                    try {
                        const client = new GoogleGenAI({ apiKey });
                        const modelCacheKey = crypto.createHash('sha256').update(apiKey).digest('hex');
                        const modelName = await resolveModel(client, modelCacheKey);
                        result = await client.models.generateContent({
                            model: modelName,
                            contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
                            config: { responseMimeType: 'application/json' }
                        });
                        break;
                    } catch (keyErr) {
                        console.warn('Gemini news processing failed for a key, trying next:', keyErr);
                    }
                }
                if (!result) throw new Error('All Gemini API keys failed');

                const aiResponse = JSON.parse(result.text || "{}");

                // Parse Market Pulse
                if (aiResponse.pulse) {
                    marketSummary = `[OVERVIEW]\n${aiResponse.pulse.overview}\n[HIGHLIGHTS]\n${aiResponse.pulse.highlights.map((h: string) => `- ${h}`).join('\n')}`;
                }

                // Map results back to articles
                if (Array.isArray(aiResponse.articles)) {
                    processedNews = processedNews.map((article, i) => {
                        const aiData = aiResponse.articles[i];
                        if (!aiData) return article;

                        let sentiment: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
                        if (aiData.sentiment?.toUpperCase().includes('BULLISH')) sentiment = 'Bullish';
                        else if (aiData.sentiment?.toUpperCase().includes('BEARISH')) sentiment = 'Bearish';

                        return {
                            ...article,
                            title: aiData.title || article.title,
                            summary: aiData.summary || article.summary,
                            sentiment
                        };
                    });
                }
            } catch (err) {
                console.error('Consolidated AI processing failed:', err);
                marketSummary = isChinese
                    ? "AI 摘要因配額或處理錯誤而無法使用。"
                    : "AI Summary unavailable due to quota or processing error.";
            }
        }

        const responsePayload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: processedNews,
            marketSummary: marketSummary,
            isAiTranslated: hasAi ? true : false
        };

        if (hasAi) console.log(`Processed ${processedNews.length} news items with Gemini. Lang: ${lang}`);
        else console.log(`Returning ${processedNews.length} news items WITHOUT Gemini translation (No API Key).`);

        // 4. Save to Redis Cache (Valid for 15 minutes)
        if (redis && !customApiKey) {
            await redis.set(CURRENT_CACHE_KEY, JSON.stringify(responsePayload), { ex: NEWS_CACHE_TTL });
            console.log('Cache updated in Redis.');
        }

        return res.status(200).json(responsePayload);

    } catch (error: any) {
        console.error('News API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch or process market news',
            message: 'Failed to fetch or process market news.'
        });
    }
}
