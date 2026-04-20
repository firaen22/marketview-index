import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
            Key: key,
        });
        const { Body, ContentLength, ContentType } = await client.send(command);

        res.setHeader('Content-Type', ContentType || 'application/pdf');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (ContentLength) res.setHeader('Content-Length', ContentLength);

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
