import { Redis } from '@upstash/redis'
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
import { GoogleGenAI } from '@google/genai';

const CACHE_KEY = 'global_market_news_v1';
const NEWS_CACHE_TTL = 60 * 15; // 15 minutes in seconds

// 1. Upstash Redis Setup
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasUpstash = !!redisUrl && !!redisToken && String(redisUrl).startsWith('https://');

let redis: Redis | null = null;
if (hasUpstash) {
    try {
        redis = new Redis({ url: redisUrl!, token: redisToken! });
    } catch (e) {
        console.error('Upstash Redis initialization error:', e);
    }
}

// 2. Gemini GenAI Setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

export default async function handler(req: any, res: any) {
    try {
        // Disable Vercel Edge caching to rely on Redis
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
        const forceRefresh = searchParams.get('refresh') === 'true';
        const lang = searchParams.get('lang') || 'en'; // default to English

        const CURRENT_CACHE_KEY = lang === 'en' ? CACHE_KEY : `${CACHE_KEY}_${lang}`;

        // Check for custom Gemini API Key in Authorization header
        const authHeader = req.headers.authorization;
        const customApiKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

        // Use custom key if provided, otherwise fallback to server key
        let activeAi = ai;
        if (customApiKey && customApiKey !== 'null' && customApiKey !== 'undefined') {
            activeAi = new GoogleGenAI({ apiKey: customApiKey });
            console.log('Using custom Gemini API key from request.');
        }

        // 1. Try to read from Redis Cache first (only if NO custom key is used)
        if (redis && !forceRefresh && !customApiKey) {
            const cachedNews: any = await redis.get(CURRENT_CACHE_KEY);
            if (cachedNews) {
                const payload = typeof cachedNews === 'string' ? JSON.parse(cachedNews) : cachedNews;
                return res.status(200).json({ ...payload, source: 'cache' });
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
        let processedNews = newsItems.map((article: any, index: number) => ({
            id: article.uuid || `news-${index}`,
            title: article.title,
            originalTitle: article.title,
            summary: article.title,
            url: article.link || article.url,
            publisher: article.publisher || "Market News",
            time: article.providerPublishTime ? new Date(article.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
            sentiment: "Neutral" as 'Bullish' | 'Bearish' | 'Neutral'
        }));

        let marketSummary = "";

        if (activeAi) {
            try {
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

                const result = await activeAi.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
                    config: { responseMimeType: 'application/json' }
                });

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
                marketSummary = "AI Summary unavailable due to quota or processing error.";
            }
        }

        const responsePayload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: processedNews,
            marketSummary: marketSummary,
            isAiTranslated: activeAi ? true : false
        };

        if (activeAi) console.log(`Processed ${processedNews.length} news items with Gemini. Lang: ${lang}`);
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
            error: error.message,
            message: 'Failed to fetch or process market news.'
        });
    }
}
