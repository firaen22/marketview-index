import YahooFinance from 'yahoo-finance2';
import { redis } from '../lib/redis.js';
import { getNimApiKeys, callNim, NIM_TEXT_MODELS } from '../lib/nim.js';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const CACHE_KEY = 'global_market_news_v1';
const NEWS_CACHE_TTL = 60 * 15; // 15 minutes in seconds

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

        const apiKeys = getNimApiKeys();
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

        if (redis && !forceRefresh) {
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
        let aiFailed = false;

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
                const raw = await callNim(apiKeys, NIM_TEXT_MODELS,
                    [{ role: 'user', content: combinedPrompt }], 3000);
                const aiResponse = JSON.parse(raw || "{}");

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
                aiFailed = true;
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
            isAiTranslated: hasAi && !aiFailed
        };

        if (hasAi && !aiFailed) console.log(`Processed ${processedNews.length} news items with NIM. Lang: ${lang}`);
        else console.log(`Returning ${processedNews.length} news items WITHOUT NIM processing (no key or AI failed).`);

        // 4. Save to Redis Cache (15 minutes; a failed AI result only for 60s so a
        // transient outage isn't served for the full TTL)
        if (redis) {
            await redis.set(CURRENT_CACHE_KEY, JSON.stringify(responsePayload), { ex: aiFailed ? 60 : NEWS_CACHE_TTL });
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
