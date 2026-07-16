// Sink for the ?jargonDebug=1 client beacon (src/jargonDebug.ts): logs each
// // pipeline-stage event to Vercel runtime logs so silent on-device failures
// // (iOS Safari) can be diagnosed without an attached inspector.
import type { VercelRequest, VercelResponse } from '@vercel/node';
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false });
    }
    try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        // Strip CR/LF so a text/plain body can't forge extra log lines in the
        // Vercel runtime log (this sink is unauthenticated).
        console.log('[jargon-debug]', String(raw).replace(/[\r\n]+/g, ' ').slice(0, 1500));
    } catch {}
    return res.status(204).end();
}
