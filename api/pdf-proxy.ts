import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PDF_KEY_PATTERN } from '../lib/pdfKey.js';

export { PDF_KEY_PATTERN } from '../lib/pdfKey.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const key = req.query?.key as string | undefined;
    if (!key) return res.status(400).json({ error: 'key query param required' });
    if (!PDF_KEY_PATTERN.test(key)) {
        return res.status(403).json({ error: 'Forbidden PDF key' });
    }

    if (
        !process.env.CLOUDFLARE_R2_ENDPOINT ||
        !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
        !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
        !process.env.CLOUDFLARE_R2_BUCKET_NAME
    ) {
        return res.status(503).json({ error: 'R2 storage not configured' });
    }

    const client = new S3Client({
        region: 'auto',
        endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
        credentials: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
    });

    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
    const rawRangeHeader = req.headers['range'];
    const rangeHeader = typeof rawRangeHeader === 'string' && /^bytes=\d{1,12}-\d{0,12}$/.test(rawRangeHeader) ? rawRangeHeader : undefined;

    try {
        // Handle HEAD requests so pdfjs can discover file size and range support
        // without fetching the full body.
        if (req.method === 'HEAD') {
            const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            res.setHeader('Content-Type', head.ContentType || 'application/pdf');
            res.setHeader('Content-Length', head.ContentLength ?? 0);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.status(200).end();
        }

        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            // Forward the Range header so pdfjs can load the PDF in small chunks.
            // This keeps each Vercel function invocation short (no full-file stream)
            // and avoids cold-start timeouts when opening a new tab.
            ...(rangeHeader ? { Range: rangeHeader } : {}),
        });
        const { Body, ContentLength, ContentType, ContentRange } = await client.send(command);

        const statusCode = ContentRange ? 206 : 200;
        res.setHeader('Content-Type', ContentType || 'application/pdf');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (ContentLength) res.setHeader('Content-Length', ContentLength);
        if (ContentRange) res.setHeader('Content-Range', ContentRange);

        res.status(statusCode);

        // Await stream end so Vercel doesn't terminate the function prematurely
        const stream = Body as NodeJS.ReadableStream;
        await new Promise<void>((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
            stream.pipe(res);
        });
    } catch (e: any) {
        if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'PDF not found' });
        console.error('R2 proxy error:', e);
        if (!res.headersSent) return res.status(500).json({ error: 'Failed to proxy PDF' });
        res.destroy(e);
    }
}
