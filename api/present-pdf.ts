import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 4 * 1024 * 1024; // Match client-side cap

async function readBody(req: any, max: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > max) {
                reject(new Error('PAYLOAD_TOO_LARGE'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function sanitizeFilename(name: string): string {
    // Strip path separators and any character outside the allowlist. Keep extension if present.
    const stripped = name.replace(/^.*[\\/]/, '');
    const cleaned = stripped.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    return cleaned || `slide-${Date.now()}.pdf`;
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)' });
    }

    // Reject oversized uploads immediately based on Content-Length header.
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > MAX_BYTES) {
        return res.status(413).json({ error: `PDF too large. Max ${MAX_BYTES / 1024 / 1024} MB.` });
    }

    try {
        const body = await readBody(req, MAX_BYTES);
        const contentType = req.headers['content-type'] || 'application/pdf';
        const rawName = req.headers['x-filename'] || `slide-${Date.now()}.pdf`;
        let decoded: string;
        try { decoded = decodeURIComponent(String(rawName)); } catch { decoded = String(rawName); }
        const filename = sanitizeFilename(decoded);

        const blob = await put(filename, body, {
            access: 'public',
            contentType: contentType.includes('pdf') ? 'application/pdf' : contentType,
            addRandomSuffix: true,
        });

        return res.status(200).json({ success: true, url: blob.url });
    } catch (e: any) {
        if (e?.message === 'PAYLOAD_TOO_LARGE') {
            return res.status(413).json({ error: `PDF too large. Max ${MAX_BYTES / 1024 / 1024} MB.` });
        }
        console.error('PDF upload error:', e);
        return res.status(500).json({ error: e.message });
    }
}
