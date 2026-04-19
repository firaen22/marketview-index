import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

async function readBody(req: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)' });
    }

    try {
        const body = await readBody(req);
        const contentType = req.headers['content-type'] || 'application/pdf';
        const rawName = req.headers['x-filename'] || `slide-${Date.now()}.pdf`;
        let filename: string;
        try { filename = decodeURIComponent(String(rawName)); } catch { filename = String(rawName); }

        const blob = await put(filename, body, {
            access: 'public',
            contentType: contentType.includes('pdf') ? 'application/pdf' : contentType,
            addRandomSuffix: true,
        });

        return res.status(200).json({ success: true, url: blob.url });
    } catch (e: any) {
        console.error('PDF upload error:', e);
        return res.status(500).json({ error: e.message });
    }
}
