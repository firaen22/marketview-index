import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { PDF_KEY_PATTERN } from '../lib/pdfKey.js';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const PRESIGN_TTL_SECONDS = 300; // 5 min window to complete the upload

function getR2Client() {
    return new S3Client({
        region: 'auto',
        endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
        },
    });
}

function isR2Configured(): boolean {
    return !!(
        process.env.CLOUDFLARE_R2_ENDPOINT &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
        process.env.CLOUDFLARE_R2_BUCKET_NAME
    );
}

function authorize(req: any): boolean {
    const requiredKey = process.env.PRESENT_API_KEY;
    if (!requiredKey) return false;
    const providedKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
    const providedHash = crypto.createHash('sha256').update(providedKey).digest();
    const requiredHash = crypto.createHash('sha256').update(requiredKey).digest();
    return crypto.timingSafeEqual(providedHash, requiredHash);
}

export function sanitizeFilename(name: string): string {
    const stripped = name.replace(/^.*[\\/]/, '');
    const cleaned = stripped.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\.+/g, '.').slice(0, 128);
    return cleaned || `slide-${Date.now()}.pdf`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!isR2Configured()) {
        return res.status(503).json({ error: 'R2 storage not configured' });
    }

    if (!process.env.PRESENT_API_KEY) {
        return res.status(503).json({ error: 'Server is missing PRESENT_API_KEY configuration' });
    }

    if (!authorize(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

    // DELETE — remove object from R2
    if (req.method === 'DELETE') {
        const key = req.headers['x-r2-key'];
        if (!key || typeof key !== 'string') {
            return res.status(400).json({ error: 'x-r2-key header required' });
        }
        if (!PDF_KEY_PATTERN.test(key)) {
            return res.status(403).json({ error: 'Forbidden key' });
        }
        try {
            const client = getR2Client();
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            return res.status(200).json({ success: true });
        } catch (e: any) {
            console.error('R2 delete error:', e);
            return res.status(500).json({ error: 'Failed to delete PDF' });
        }
    }

    // POST — generate presigned PUT URL for direct client upload
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let body: any;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const rawName = typeof body?.filename === 'string' && body.filename.trim() ? body.filename : `slide-${Date.now()}.pdf`;
    const filename = sanitizeFilename(rawName);
    const suffix = crypto.randomBytes(6).toString('hex');
    const key = `${Date.now()}-${suffix}-${filename}`;

    const contentLength = Number(body?.size);
    if (!Number.isInteger(contentLength) || contentLength <= 0 || contentLength > MAX_BYTES) {
        return res.status(400).json({ error: `PDF size must be greater than 0 and no more than ${MAX_BYTES / 1024 / 1024} MB.` });
    }

    try {
        const client = getR2Client();
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: 'application/pdf',
            ContentLength: contentLength,
        });
        const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });

        // Proxy URL is what gets stored — never exposes R2 directly
        const proxyUrl = `/api/pdf-proxy?key=${encodeURIComponent(key)}`;

        return res.status(200).json({ uploadUrl, proxyUrl, key });
    } catch (e: any) {
        console.error('R2 presign error:', e);
        return res.status(500).json({ error: 'Failed to create upload URL' });
    }
}
