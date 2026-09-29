import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { redis } from '../lib/redis.js';
import { getNimApiKeys, callNim, NIM_TEXT_MODELS } from '../lib/nim.js';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const CACHE_KEY = 'global_market_news_v1';
const NEWS_CACHE_TTL = 60 * 15; // 15 minutes in seconds

// Overlays AI summaries/sentiment onto the fetched headlines, joined by the id
// the prompt gave each article (1-based) — never by position, so a reordered
// response can't put a summary under the wrong headline on the projector.
// `matched` counts the articles that received an entry.
export function applyAiArticleData<T extends { title: string; summary: string; sentiment: 'Bullish' | 'Bearish' | 'Neutral' }>(
    articles: T[],
    aiArticles: unknown,
): { articles: T[]; matched: number } {
    if (!Array.isArray(aiArticles)) return { articles, matched: 0 };
    // id -> entry; an id claimed by two entries is ambiguous and maps to null.
    const byId = new Map<string, unknown>();
    for (const entry of aiArticles) {
        const id = entry && typeof entry === 'object' ? (entry as any).id : undefined;
        if (typeof id !== 'number' && typeof id !== 'string') continue;
        const key = String(id).trim();
        byId.set(key, byId.has(key) ? null : entry);
    }
    let matched = 0;
    const updated = articles.map((article, i) => {
        const aiData: any = byId.get(String(i + 1));
        if (!aiData) return article;
        matched++;

        // Only an explicit string sentiment overrides; a missing/malformed
        // field keeps the article's existing sentiment.
        let sentiment = article.sentiment;
        if (typeof aiData.sentiment === 'string') {
            const upper = aiData.sentiment.toUpperCase();
            sentiment = upper.includes('BULLISH') ? 'Bullish' : upper.includes('BEARISH') ? 'Bearish' : 'Neutral';
        }

        return {
            ...article,
            title: typeof aiData.title === 'string' && aiData.title ? aiData.title : article.title,
            summary: typeof aiData.summary === 'string' && aiData.summary ? aiData.summary : article.summary,
            sentiment,
        };
    });
    return { articles: updated, matched };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Hoisted above the try so the catch block's stale-cache fallback can see it.
    let staleCacheKey: string | null = null;
    let lastGoodCacheKey: string | null = null;
    let acquiredThrottleKey: string | null = null;
    const releaseThrottle = async () => {
        if (!acquiredThrottleKey || !redis) return;
        try { await redis.del(acquiredThrottleKey); } catch (e) { console.error('Failed to release refresh throttle:', e); }
        acquiredThrottleKey = null;
    };
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
        staleCacheKey = CURRENT_CACHE_KEY;
        lastGoodCacheKey = `${CURRENT_CACHE_KEY}_last_good`;
        const parseCache = (cachedNews: any): any | null => {
            if (!cachedNews) return null;
            if (typeof cachedNews !== 'string') return cachedNews;
            try {
                return JSON.parse(cachedNews);
            } catch {
                return null;
            }
        };
        const returnCachedPayload = (payload: any) => {
            return res.status(200).json({ ...payload, source: 'cache' });
        };

        const apiKeys = getNimApiKeys();
        const hasAi = apiKeys.length > 0;

        // 1. Try to read from Redis Cache first (only if NO custom key is used)
        let cachedNews: any = redis ? await redis.get(CURRENT_CACHE_KEY) : null;
        const parsedCache = parseCache(cachedNews);
        if (redis && forceRefresh) {
            const throttleKey = `refresh_throttle_${CURRENT_CACHE_KEY}`;
            // NX makes the check-and-arm atomic: two concurrent refreshes must
            // not both observe "no throttle" and double-fetch Yahoo + NIM
            // (same pattern as api/market-data.ts).
            const lock = await redis.set(throttleKey, '1', { ex: 60, nx: true });
            if (lock) acquiredThrottleKey = throttleKey;
            if (!lock && parsedCache) {
                return returnCachedPayload(parsedCache);
            }
            if (!lock) {
                return res.status(503).json({ success: false, error: 'Refresh already in progress' });
            }
        }

        if (redis && !forceRefresh) {
            if (parsedCache) {
                return returnCachedPayload(parsedCache);
            }
        }

        // 2. Fetch Fresh News from Yahoo Finance
        console.log('Fetching fresh news from multi-source search...');

        // Each search gets its own deadline (same 5s as api/market-data.ts): one
        // hung socket must not hold the three that already answered until the
        // platform kills the function.
        const searchTasks = ['SPY', 'QQQ', 'Reuters Bloomberg', 'Seeking Alpha Investing.com'].map(q =>
            yahooFinance.search(q, { newsCount: 5, quotesCount: 0 }, {
                fetchOptions: { signal: AbortSignal.timeout(5000) },
            }));

        const settledResults = await Promise.allSettled(searchTasks);
        let allNews: any[] = [];
        let allRejected = true;
        settledResults.forEach(result => {
            if (result.status === 'fulfilled') {
                allNews = [...allNews, ...(Array.isArray(result.value.news) ? result.value.news : [])];
                allRejected = false;
            }
        });
        if (allRejected) throw new Error('All news searches failed');
        // Like macro-data's full-set gate: a fetch that lost some searches is
        // served, but must not displace a full list for the whole cache TTL.
        const partialFetch = settledResults.some(r => r.status === 'rejected');

        // Deduplicate by UUID
        const seen = new Set();
        const newsItems = allNews.filter(n => {
            // One null entry in a fulfilled search must not throw away the rest.
            if (!n || typeof n !== 'object' || !n.uuid || seen.has(n.uuid)) return false;
            seen.add(n.uuid);
            return true;
        }).sort((a, b) => {
            const premiumSources = ['Reuters', 'Bloomberg', 'Investing.com', 'Seeking Alpha'];
            // null would become 1970 via new Date(null); treat it as missing.
            const aTime = a.providerPublishTime == null ? NaN : new Date(a.providerPublishTime).getTime();
            const bTime = b.providerPublishTime == null ? NaN : new Date(b.providerPublishTime).getTime();
            const aValid = Number.isFinite(aTime);
            const bValid = Number.isFinite(bTime);
            if (aValid && !bValid) return -1;
            if (!aValid && bValid) return 1;
            if (aValid && bValid && aTime !== bTime) return bTime - aTime;
            const aIsPremium = premiumSources.some(s => a.publisher?.includes(s));
            const bIsPremium = premiumSources.some(s => b.publisher?.includes(s));
            if (aIsPremium && !bIsPremium) return -1;
            if (!aIsPremium && bIsPremium) return 1;
            return 0;
        }).slice(0, 8);

        if (newsItems.length === 0) {
            if (parsedCache) {
                await releaseThrottle();
                return res.status(200).json({ ...parsedCache, source: 'server_stale_cache', stale: true });
            }
            let lastGood: any = null;
            if (redis && lastGoodCacheKey) {
                try { lastGood = parseCache(await redis.get(lastGoodCacheKey)); } catch (e) { console.error('Failed to read news last-good cache:', e); }
            }
            if (lastGood) {
                await releaseThrottle();
                return res.status(200).json({ ...lastGood, source: 'server_stale_cache', stale: true });
            }
            await releaseThrottle();
            return res.status(503).json({
                success: false,
                error: 'No market news available',
            });
        }

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
${newsItems.map((n: any, i: number) => `${i + 1}. [id=${i + 1}] [${n.publisher}] ${n.title}`).join('\n')}

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
    { "id": 1, "title": "...", "summary": "...", "sentiment": "..." },
    ...
  ]
}
Return exactly one entry per article and copy its id unchanged.
`;

            try {
                const raw = await callNim(apiKeys, NIM_TEXT_MODELS,
                    [{ role: 'user', content: combinedPrompt }], 3000, { deadlineMs: 25_000 });
                const aiResponse = JSON.parse(raw || "{}");

                // Parse Market Pulse
                if (aiResponse.pulse) {
                    const overview = aiResponse.pulse.overview ?? '';
                    const highlights = Array.isArray(aiResponse.pulse.highlights) ? aiResponse.pulse.highlights : [];
                    marketSummary = `[OVERVIEW]\n${overview}\n[HIGHLIGHTS]\n${highlights.map((h: string) => `- ${h}`).join('\n')}`;
                }

                const aiResult = applyAiArticleData(processedNews, aiResponse.articles);
                processedNews = aiResult.articles;
                // A 200 whose articles failed the gate left every headline
                // untranslated: don't label it translated or cache it for 15 min.
                if (aiResult.matched !== processedNews.length) {
                    aiFailed = true;
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

        // 4. Save to Redis Cache (15 minutes; a failed AI result or a partial fetch
        // only for 60s so a transient outage isn't served for the full TTL)
        // A cache-write failure must not turn the fresh payload into a 500.
        if (redis) {
            try {
                await redis.set(CURRENT_CACHE_KEY, JSON.stringify(responsePayload), { ex: aiFailed || partialFetch ? 60 : NEWS_CACHE_TTL });
                console.log('Cache updated in Redis.');
            } catch (e) {
                console.error('News cache write failed:', e);
            }
            if (!partialFetch && !(hasAi && aiFailed)) {
                try {
                    await redis.set(lastGoodCacheKey!, JSON.stringify(responsePayload), { ex: 7 * 24 * 3600 });
                } catch (e) {
                    console.error('News last-good cache write failed:', e);
                }
            }
        }

        return res.status(200).json(responsePayload);

    } catch (error: any) {
        console.error('News API Error:', error);

        // Fallback: serve stale cache if available
        if (redis && staleCacheKey) {
            try {
                let parsed: any = null;
                // A failed hot read must still fall through to last-good.
                try {
                    const fallbackPayload: any = await redis.get(staleCacheKey);
                    parsed = typeof fallbackPayload === 'string' ? JSON.parse(fallbackPayload) : fallbackPayload;
                } catch { parsed = null; }
                if (!parsed && lastGoodCacheKey) {
                    const lastGood = await redis.get(lastGoodCacheKey);
                    try { parsed = typeof lastGood === 'string' ? JSON.parse(lastGood) : lastGood; } catch { parsed = null; }
                }
                if (parsed) {
                    // Keep the cached payload's success flag: the data is
                    // valid, just stale (matches api/macro-data.ts's fallback).
                    await releaseThrottle();
                    return res.status(200).json({
                        ...parsed,
                        source: 'server_stale_cache',
                        stale: true,
                    });
                }
            } catch (e) {
                console.error('Failed to read fallback from redis:', e);
            }
        }

        await releaseThrottle();

        return res.status(500).json({
            success: false,
            error: 'Failed to fetch or process market news',
            message: 'Failed to fetch or process market news.'
        });
    }
}
