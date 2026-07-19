import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PDF_KEY_PATTERN } from '../lib/pdfKey.js';

export { PDF_KEY_PATTERN } from '../lib/pdfKey.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
        // A client that goes away mid-request (tab closed, or pdfjs cancelling
        // an in-flight range request on a page turn) leaves pipe() with nothing
        // to do but unpipe: the R2 stream stays paused, so neither 'end' nor
        // 'error' ever fires and the await below would stay pending until the
        // function hits its platform timeout. The guard is armed BEFORE the
        // GetObject round-trip, because a disconnect during that await would
        // otherwise fire 'close' with no listener attached at all.
        let clientGone = false;
        let source: (NodeJS.ReadableStream & { destroy?: () => void }) | null = null;
        let settleOnAbort: (() => void) | null = null;
        const onAbort = () => {
            clientGone = true;
            source?.destroy?.();
            settleOnAbort?.();
        };
        res.once('close', onAbort);

        const { Body, ContentLength, ContentType, ContentRange } = await client.send(command);
        source = Body as NodeJS.ReadableStream & { destroy?: () => void };
        // destroy() on an aborted body can still emit 'error'; without a listener
        // that is an unhandled 'error' event, i.e. an uncaught exception in the
        // function. Attach before any path that can destroy the stream. The real
        // error handling is the one registered alongside pipe() below.
        source.on('error', () => {});
        if (clientGone || res.destroyed) {
            res.off('close', onAbort);
            source?.destroy?.();
            return;
        }

        const statusCode = ContentRange ? 206 : 200;
        res.setHeader('Content-Type', ContentType || 'application/pdf');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (ContentLength) res.setHeader('Content-Length', ContentLength);
        if (ContentRange) res.setHeader('Content-Range', ContentRange);

        res.status(statusCode);

        // Await stream end so Vercel doesn't terminate the function prematurely
        const stream = source;
        await new Promise<void>((resolve, reject) => {
            settleOnAbort = resolve;
            stream.on('end', () => {
                res.off('close', onAbort);
                resolve();
            });
            stream.on('error', (err) => {
                res.off('close', onAbort);
                reject(err);
            });
            stream.pipe(res);
        });
    } catch (e: any) {
        // GetObject reports a missing key as NoSuchKey, but HeadObject has no
        // response body to parse and surfaces it as NotFound — matching only the
        // former turned "deck was deleted" into a 500 on the HEAD that pdfjs
        // issues first.
        // Deliberately name-only: matching $metadata 404 would also swallow
        // NoSuchBucket, turning a misconfigured bucket (a total deck outage) into
        // a per-file "not found" with no console.error to diagnose it.
        if (e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
            return res.status(404).json({ error: 'PDF not found' });
        }
        console.error('R2 proxy error:', e);
        if (!res.headersSent) return res.status(500).json({ error: 'Failed to proxy PDF' });
        res.destroy(e);
    }
}
