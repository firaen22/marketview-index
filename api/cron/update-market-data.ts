import { redis } from '../../lib/redis.js';
import { fetchAllIndices, CACHE_KEY } from '../market-data.js';

// Deliberately a subset of VALID_RANGES: pre-warming all seven would multiply
// this cron's Yahoo fan-out past the function timeout. The extra ranges
// (1W/6M/5Y) fetch live on first request and then sit in Redis for an hour.
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

  // Partial success is not a failed invocation: a 500 here would page on one
  // flaky range even though the others were cached. Reserve 5xx for total loss.
  const allOk = Object.values(results).every(r => r.success);
  const anyOk = Object.values(results).some(r => r.success);
  return res.status(anyOk ? 200 : 500).json({ success: allOk, results });
}
