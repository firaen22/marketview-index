import { Redis } from '@upstash/redis'
import yahooFinance from 'yahoo-finance2';
import { GoogleGenAI } from '@google/genai';

const CACHE_KEY = 'global_market_news_v1';
const NEWS_CACHE_TTL = 60 * 15; // 15 minutes in seconds

// 1. Upstash Redis Setup
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasUpstash = !!redisUrl && !!redisToken;

const redis = hasUpstash
    ? new Redis({ url: redisUrl!, token: redisToken! })
    : null;

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
            const cachedNews: any = await redis.get(CACHE_KEY);
            if (cachedNews) {
                const payload = typeof cachedNews === 'string' ? JSON.parse(cachedNews) : cachedNews;
                return res.status(200).json({ ...payload, source: 'cache' });
            }
        }

        // 2. Fetch Fresh News from Yahoo Finance
        console.log('Fetching fresh news from Yahoo Finance...');
        const searchResults = await yahooFinance.search('AAPL OR TSLA OR NVDA OR SPY', {
            newsCount: 5,
            quotesCount: 0
        });

        const newsItems: any[] = (searchResults as any).news || [];

        // 3. Process each News Item with Gemini AI
        const processedNews = await Promise.all(newsItems.map(async (article, index) => {
            let aiSummary = article.title; // Fallback
            let aiSentiment = "Neutral";

            if (activeAi) {
                try {
                    const prompt = `Analyze this financial news headline and short summary:
TITLE: ${article.title}
SUMMARY: ${article.publisher}
Link to article publisher for context.

TASK:
1. Write a strict 30-word max summary of how this news impacts the US or Global market.
2. Determine if the sentiment is strictly BULLISH, BEARISH, or NEUTRAL.

OUTPUT FORMAT (strictly follow this):
[SENTIMENT]
[SUMMARY]

Example:
BULLISH
Strong earnings from tech giants are expected to drive the S&P 500 higher this week amidst cooling inflation data.
`;
                    // Note: using 'gemini-2.0-flash' for latest performance
                    const response = await activeAi.models.generateContent({
                        model: 'gemini-2.0-flash',
                        contents: prompt,
                    });

                    const text = response.text || "";
                    const lines = text.split('\n').filter(line => line.trim() !== '');

                    if (lines.length >= 2) {
                        const parsedSentiment = lines[0].trim().toUpperCase();
                        if (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(parsedSentiment)) {
                            aiSentiment = parsedSentiment.charAt(0) + parsedSentiment.slice(1).toLowerCase();
                        }
                        aiSummary = lines.slice(1).join(' ').trim();
                    }

                } catch (genErr) {
                    console.warn('Gemini AI Generation failed for an article:', genErr);
                }
            }

            return {
                id: article.uuid || `news-${index}`,
                source: article.publisher || 'Yahoo Finance',
                time: new Date(article.providerPublishTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                title: article.title,
                summary: aiSummary,
                sentiment: aiSentiment,
                sentimentScore: aiSentiment === 'Bullish' ? 0.8 : (aiSentiment === 'Bearish' ? -0.8 : 0),
                url: article.link
            };
        }));

        const responsePayload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: processedNews
        };

        // 4. Save to Redis Cache (Valid for 15 minutes)
        if (redis) {
            await redis.set(CACHE_KEY, JSON.stringify(responsePayload), { ex: NEWS_CACHE_TTL });
        }

        return res.status(200).json({ ...responsePayload, source: 'live' });

    } catch (error: any) {
        console.error('News API Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to fetch or process market news.'
        });
    }
}
