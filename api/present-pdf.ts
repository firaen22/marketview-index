import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { del } from '@vercel/blob';

// Hard cap on uploaded PDF size — Vercel Blob supports much larger, but we
// keep slides reasonable. Bump if you need bigger.
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

type AuthResult = { ok: true } | { ok: false; code: number; error: string };

function authorize(req: any): AuthResult {
    const requiredKey = process.env.PRESENT_API_KEY;
    if (!requiredKey) return { ok: true };
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== requiredKey) return { ok: false, code: 401, error: 'Unauthorized' };
    return { ok: true };
}

export default async function handler(req: any, res: any) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)' });
    }

    // DELETE — remove an old blob when replacing
    if (req.method === 'DELETE') {
        const auth = authorize(req);
        if (auth.ok === false) return res.status(auth.code).json({ error: auth.error });

        const url = req.headers['x-blob-url'];
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'x-blob-url header required' });
        }
        if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
            return res.status(400).json({ error: 'Invalid blob URL' });
        }
        try {
            await del(url);
            return res.status(200).json({ success: true });
        } catch (e: any) {
            console.error('PDF delete error:', e);
            return res.status(500).json({ error: e.message });
        }
    }

    // POST — sign a client-direct upload URL (body bypasses this function entirely)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body as HandleUploadBody;
    const requiredKey = process.env.PRESENT_API_KEY;

    try {
        const jsonResponse = await handleUpload({
            body,
            request: req,
            onBeforeGenerateToken: async (_pathname, clientPayload) => {
                // Validate the shared secret passed via clientPayload
                if (requiredKey && clientPayload !== requiredKey) {
                    throw new Error('Unauthorized');
                }
                return {
                    allowedContentTypes: ['application/pdf'],
                    maximumSizeInBytes: MAX_BYTES,
                    addRandomSuffix: true,
                };
            },
            onUploadCompleted: async ({ blob }) => {
                console.log('PDF upload completed:', blob.url);
            },
        });
        return res.status(200).json(jsonResponse);
    } catch (e: any) {
        const status = e.message === 'Unauthorized' ? 401 : 400;
        console.error('PDF upload token error:', e);
        return res.status(status).json({ error: e.message });
    }
}
