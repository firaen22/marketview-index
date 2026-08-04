import { getClientIp } from './clientIp.js';

export async function incrementRateLimit(
    redis: any,
    req: any,
    prefix: string,
    windowSeconds: number,
): Promise<number> {
    const key = `${prefix}_${getClientIp(req)}`;
    const count = await redis.incr(key);
    // -1 TTL = counter survived a crash between incr and expire; re-arm it.
    if (count === 1 || (await redis.ttl(key)) === -1) {
        await redis.expire(key, windowSeconds);
    }
    return count;
}
