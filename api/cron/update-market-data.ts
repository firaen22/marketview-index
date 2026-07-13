import { redis } from '../../lib/redis.js';
import { fetchAllIndices, CACHE_KEY } from '../market-data.js';

const RANGES = ['1M', '3M', 'YTD', '1Y'];

export default async function handler(req: any, res: any) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!redis) {
    return res.status(200).json({ success: false, error: 'Redis not configured; nothing to pre-warm.' });
  }

  const results: Record<string, { success: boolean; count?: number; error?: string }> = {};
  for (const range of RANGES) {
    try {
      const data = await fetchAllIndices(range);
      const payload = {
        success: true,
        source: 'cron_updated_cache',
        timestamp: new Date().toISOString(),
        data,
      };
      await redis.set(`${CACHE_KEY}_${range}`, JSON.stringify(payload), { ex: 3600 });
      results[range] = { success: true, count: data.length };
    } catch (error: any) {
      console.error(`Cron pre-warm failed for range ${range}:`, error);
      results[range] = { success: false, error: error?.message || 'Unknown error' };
    }
  }

  const allOk = Object.values(results).every(r => r.success);
  return res.status(allOk ? 200 : 500).json({ success: allOk, results });
}
