import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export default async function handler(req: any, res: any) {
    const key = req.query?.key as string | undefined;
    if (!key) return res.status(400).json({ error: 'key query param required' });

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
    const rangeHeader = req.headers['range'] as string | undefined;

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

        const statusCode = rangeHeader ? 206 : 200;
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
        if (!res.headersSent) return res.status(500).json({ error: e.message });
    }
}
