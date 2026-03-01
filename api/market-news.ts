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

        // 3. Process each News Item with Gemini AI
        const processedNews = await Promise.all(newsItems.map(async (article, index) => {
            let aiSummary = article.title;
            let aiSentiment = "Neutral";
            let translatedTitle = article.title;

            if (activeAi) {
                try {
                    const prompt = `Analyze this financial news article:
TITLE: ${article.title}
PUBLISHER: ${article.publisher}

TASK:
1. [SENTIMENT]: BULLISH, BEARISH, or NEUTRAL.
2. [TITLE]: ${isChinese ? 'Translate the TITLE to Traditional Chinese (繁體中文). Professional financial style.' : 'Original or refined TITLE in English.'}
3. [SUMMARY]: ${isChinese ? 'Summary of market impact in Traditional Chinese (繁體中文), max 35 words.' : 'Summary of market impact in English, max 30 words.'}

OUTPUT FORMAT (Strictly 3 lines, no extra text, no markdown like ** or #):
LINE1: THE_SENTIMENT
LINE2: THE_TRANSLATED_TITLE
LINE3: THE_SUMMARY

Example output:
${isChinese ? '看漲\n標普 500 指數因科技股走強而看漲\n科技巨頭的強勁業績預計在大盤反彈背景下推動指數走高。' : 'BULLISH\nS&P 500 Bullish on Tech Strength\nStrong earnings from tech giants are expected to drive the index higher amidst a broader market rally.'}
`;
                    const response = await activeAi.models.generateContent({
                        model: 'gemini-2.0-flash-exp',
                        contents: prompt,
                    });

                    const text = (response.text || "").trim();
                    const lines = text.split('\n')
                        .map(l => l.replace(/^(LINE\d:|\[.*?\]|\d\.\s*)/i, '').trim())
                        .filter(l => l !== '');

                    if (lines.length >= 3) {
                        const rawSentiment = lines[0].toUpperCase();
                        if (['BULLISH', '看漲', '看涨'].some(s => rawSentiment.includes(s))) aiSentiment = 'Bullish';
                        else if (['BEARISH', '看跌'].some(s => rawSentiment.includes(s))) aiSentiment = 'Bearish';
                        else aiSentiment = 'Neutral';

                        translatedTitle = lines[1];
                        aiSummary = lines.slice(2).join(' ').trim();
                    } else if (lines.length === 2) {
                        const rawSentiment = lines[0].toUpperCase();
                        if (['BULLISH', '看漲', '看涨'].some(s => rawSentiment.includes(s))) aiSentiment = 'Bullish';
                        else if (['BEARISH', '看跌'].some(s => rawSentiment.includes(s))) aiSentiment = 'Bearish';
                        else aiSentiment = 'Neutral';
                        aiSummary = lines[1];
                    }
                } catch (genErr) {
                    console.warn('Gemini AI Generation failed for an article:', genErr);
                }
            }

            return {
                id: article.uuid || `news-${index}`,
                source: article.publisher || 'Yahoo Finance',
                time: new Date(article.providerPublishTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                title: translatedTitle,
                summary: aiSummary,
                sentiment: aiSentiment,
                sentimentScore: aiSentiment === 'Bullish' ? 0.8 : (aiSentiment === 'Bearish' ? -0.8 : 0),
                url: article.link
            };
        }));

        const responsePayload = {
            success: true,
            timestamp: new Date().toISOString(),
            data: processedNews,
            isAiTranslated: activeAi ? true : false
        };

        if (activeAi) console.log(`Processed ${processedNews.length} news items with Gemini. Lang: ${lang}`);
        else console.log(`Returning ${processedNews.length} news items WITHOUT Gemini translation (No API Key).`);

        // 4. Save to Redis Cache (Valid for 15 minutes)
        if (redis && !customApiKey) {
            await redis.set(CURRENT_CACHE_KEY, JSON.stringify(responsePayload), { ex: NEWS_CACHE_TTL });
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
