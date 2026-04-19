import { redis } from './_redis';

const SLIDE_KEY = 'marketflow_present_slide_v1';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!redis) {
    return res.status(503).json({ error: 'Storage not configured' });
  }

  // GET — load saved slide
  if (req.method === 'GET') {
    try {
      const data = await redis.get(SLIDE_KEY);
      return res.status(200).json({ success: true, slide: data ?? null });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — save slide
  if (req.method === 'POST') {
    let body: any;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    } else {
      body = req.body;
    }
    const { mode, content } = body ?? {};
    if (!mode || content === undefined) {
      return res.status(400).json({ error: 'mode and content required' });
    }
    try {
      const slide = { mode, content, updatedAt: Date.now() };
      await redis.set(SLIDE_KEY, JSON.stringify(slide));
      return res.status(200).json({ success: true, slide });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
