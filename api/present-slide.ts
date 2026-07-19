import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const SLIDE_KEY = 'slide-state/marketflow_present_slide_v1.json';
// Keep in sync with PresentSlideMode in src/settings.ts.
const ALLOWED_MODES = ['markdown', 'html', 'url', 'pdf'];
const MAX_CAS_ATTEMPTS = 3;

function makeClient(): S3Client | null {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) return null;
    return new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
    });
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
    });
}

function authorize(providedKey: unknown, requiredKey: string): boolean {
    const provided = typeof providedKey === 'string' ? providedKey : '';
    const providedHash = crypto.createHash('sha256').update(provided).digest();
    const requiredHash = crypto.createHash('sha256').update(requiredKey).digest();
    return crypto.timingSafeEqual(providedHash, requiredHash);
}

function isCasConflict(err: any): boolean {
    return err?.name === 'PreconditionFailed'
        || err?.name === 'ConditionalRequestConflict'
        || err?.$metadata?.httpStatusCode === 412;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const client = makeClient();
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    if (!client || !bucket) {
        return res.status(503).json({ error: 'Storage not configured' });
    }

    // GET — load saved slide
    if (req.method === 'GET') {
        try {
            const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: SLIDE_KEY }));
            const text = await readStream(Body as NodeJS.ReadableStream);
            const slide = JSON.parse(text);
            return res.status(200).json({ success: true, slide });
        } catch (e: any) {
            if (e?.name === 'NoSuchKey') return res.status(200).json({ success: true, slide: null });
            console.error('Slide read error:', e);
            return res.status(500).json({ error: 'Failed to load slide' });
        }
    }

    // POST — save slide (requires auth)
    if (req.method === 'POST') {
        const requiredKey = process.env.PRESENT_API_KEY;
        if (!requiredKey) {
            return res.status(503).json({ error: 'Server is missing PRESENT_API_KEY configuration' });
        }
        if (!authorize(req.headers['x-api-key'], requiredKey)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let body: any;
        if (typeof req.body === 'string') {
            try { body = JSON.parse(req.body); } catch {
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
        } else {
            body = req.body;
        }
        const { mode, content } = body ?? {};
        if (mode === undefined || content === undefined) {
            return res.status(400).json({ error: 'mode and content required' });
        }
        if (!ALLOWED_MODES.includes(mode)) {
            return res.status(400).json({ error: 'Invalid mode' });
        }
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'content must be a string' });
        }
        if (content.length > 1_000_000) {
            return res.status(413).json({ error: 'Content too large' });
        }
        const incomingUpdatedAt = body?.updatedAt;
        const hasClientUpdatedAt = typeof incomingUpdatedAt === 'number'
            && Number.isFinite(incomingUpdatedAt)
            && incomingUpdatedAt > 0;
        // Client timestamps preserve save ordering across devices; legacy clients
        // still get server-stamped saves and skip conflicts for compatibility.
        if (hasClientUpdatedAt) {
            for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
                let condition: { IfMatch?: string; IfNoneMatch?: string } = {};
                try {
                    const { Body, ETag } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: SLIDE_KEY }));
                    const text = await readStream(Body as NodeJS.ReadableStream);
                    const storedSlide = JSON.parse(text);
                    // Strictly newer only: re-posting the same timestamp (manual Save after
                    // the debounced autosave) must stay idempotent, not 409.
                    if (Number.isFinite(storedSlide?.updatedAt) && storedSlide.updatedAt > incomingUpdatedAt) {
                        return res.status(409).json({ error: 'Stale save: newer content already stored' });
                    }
                    // The AWS SDK returns S3/R2 ETags as received, normally including
                    // surrounding double quotes; pass the exact string through for CAS.
                    if (typeof ETag === 'string' && ETag.length > 0) {
                        condition = { IfMatch: ETag };
                    }
                } catch (e: any) {
                    if (e?.name === 'NoSuchKey') {
                        condition = { IfNoneMatch: '*' };
                    } else {
                        console.error('Slide conflict read error:', e);
                    }
                }
                try {
                    // Clamp client timestamps to ~now: a future-skewed device clock must not
                    // make every other device's saves 409 until wall-clock catches up.
                    const now = Date.now();
                    const slide = { mode, content, updatedAt: Math.min(incomingUpdatedAt, now + 60_000) };
                    await client.send(new PutObjectCommand({
                        Bucket: bucket,
                        Key: SLIDE_KEY,
                        Body: JSON.stringify(slide),
                        ContentType: 'application/json',
                        ...condition,
                    }));
                    return res.status(200).json({ success: true, slide });
                } catch (e: any) {
                    if (isCasConflict(e)) continue;
                    console.error('Slide save error:', e);
                    return res.status(500).json({ error: 'Failed to save slide' });
                }
            }
            return res.status(503).json({ error: 'Concurrent save conflict; retry save' });
        }
        try {
            // Clamp client timestamps to ~now: a future-skewed device clock must not
            // make every other device's saves 409 until wall-clock catches up.
            const now = Date.now();
            const slide = { mode, content, updatedAt: now };
            await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: SLIDE_KEY,
                Body: JSON.stringify(slide),
                ContentType: 'application/json',
            }));
            return res.status(200).json({ success: true, slide });
        } catch (e: any) {
            console.error('Slide save error:', e);
            return res.status(500).json({ error: 'Failed to save slide' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
