import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const SLIDE_KEY = 'slide-state/marketflow_present_slide_v1.json';

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

export default async function handler(req: any, res: any) {
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
            return res.status(500).json({ error: e.message });
        }
    }

    // POST — save slide (requires auth if PRESENT_API_KEY is set)
    if (req.method === 'POST') {
        const requiredKey = process.env.PRESENT_API_KEY;
        if (requiredKey && req.headers['x-api-key'] !== requiredKey) {
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
        if (!mode || content === undefined) {
            return res.status(400).json({ error: 'mode and content required' });
        }
        try {
            const slide = { mode, content, updatedAt: Date.now() };
            await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: SLIDE_KEY,
                Body: JSON.stringify(slide),
                ContentType: 'application/json',
            }));
            return res.status(200).json({ success: true, slide });
        } catch (e: any) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
