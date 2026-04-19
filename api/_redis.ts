import { Redis } from '@upstash/redis';

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

export { redis };
