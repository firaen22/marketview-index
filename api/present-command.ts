import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../lib/redis.js';
import { getClientIp } from '../lib/clientIp.js';
import { callNim, getNimApiKeys, NIM_TEXT_MODELS } from '../lib/nim.js';
import {
    buildParsePrompt,
    buildPresentCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    parseCommandDeterministic,
    validatePresentIntent,
} from '../lib/presentCommand.js';

const COMMAND_KEY = 'present:cmd:v1';
const COMMAND_TTL_SECONDS = 120;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 30;
const LANGS = ['en', 'zh-TW'];
const GROUPS = ['market', 'macro'];

function authorize(providedKey: unknown, requiredKey: string): boolean {
    const provided = typeof providedKey === 'string' ? providedKey : '';
    const providedHash = crypto.createHash('sha256').update(provided).digest();
    const requiredHash = crypto.createHash('sha256').update(requiredKey).digest();
    return crypto.timingSafeEqual(providedHash, requiredHash);
}

function parseBody(body: any): { ok: true; body: any } | { ok: false } {
    if (typeof body === 'string') {
        try {
            return { ok: true, body: JSON.parse(body) };
        } catch {
            return { ok: false };
        }
    }
    return { ok: true, body };
}

function json(res: any, status: number, body: any) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(body);
}

async function rateLimit(req: any): Promise<boolean> {
    if (!redis) return true;
    try {
        const key = `presentcmd_rl_${getClientIp(req)}`;
        const count = await redis.incr(key);
        if (count === 1 || (await redis.ttl(key)) === -1) {
            await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }
        return count <= RATE_LIMIT_MAX;
    } catch (error) {
        console.error('Present command rate limit error:', error);
        return true;
    }
}

function validCatalog(value: unknown): value is CatalogItem[] {
    return Array.isArray(value)
        && value.length >= 1
        && value.length <= 120
        && value.every(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
            const entry = item as Record<string, unknown>;
            return typeof entry.symbol === 'string'
                && entry.symbol.length > 0
                && entry.symbol.length <= 24
                && typeof entry.name === 'string'
                && entry.name.length > 0
                && entry.name.length <= 80
                && (entry.nameEn === undefined || (typeof entry.nameEn === 'string' && entry.nameEn.length <= 80))
                && typeof entry.group === 'string'
                && GROUPS.includes(entry.group);
        });
}

function canonicalCatalog(catalog: CatalogItem[]): CatalogItem[] {
    return catalog.map(item => ({
        symbol: item.symbol,
        name: item.name,
        ...(item.nameEn !== undefined ? { nameEn: item.nameEn } : {}),
        group: item.group,
    }));
}

async function storeCommand(command: ReturnType<typeof buildPresentCommand>) {
    await redis!.set(COMMAND_KEY, JSON.stringify(command), { ex: COMMAND_TTL_SECONDS });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!redis) {
        return json(res, 503, { error: 'Storage not configured' });
    }

    if (req.method === 'GET') {
        if (!await rateLimit(req)) return json(res, 429, { error: 'rate_limited' });
        try {
            const stored = await redis.get(COMMAND_KEY);
            if (!stored) return json(res, 200, { success: true, command: null });
            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            return json(res, 200, {
                success: true,
                command: isExecutablePresentCommand(parsed) ? parsed : null,
            });
        } catch (error) {
            console.error('Present command read error:', error);
            return json(res, 200, { success: true, command: null });
        }
    }

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const parsed = parseBody(req.body);
    if (!parsed.ok || !parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) {
        return json(res, 400, { error: 'Invalid JSON body' });
    }

    const requiredKey = process.env.PRESENT_API_KEY;
    if (!requiredKey) {
        return json(res, 503, { error: 'Server is missing PRESENT_API_KEY configuration' });
    }
    if (!authorize(req.headers?.['x-api-key'], requiredKey)) {
        return json(res, 401, { error: 'Unauthorized' });
    }

    try {
        if (parsed.body.action === 'clear') {
            const command = buildPresentCommand({ kind: 'clear', symbols: [] }, crypto.randomUUID(), Date.now());
            await storeCommand(command);
            return json(res, 200, { success: true, command });
        }

        if (parsed.body.action !== 'send') {
            return json(res, 400, { error: 'Unknown action' });
        }

        const text = typeof parsed.body.text === 'string' ? parsed.body.text.trim() : '';
        if (text.length < 1 || text.length > 200) {
            return json(res, 400, { error: 'invalid_text' });
        }
        const lang = parsed.body.lang;
        if (!LANGS.includes(lang)) {
            return json(res, 400, { error: 'Invalid lang' });
        }
        if (!validCatalog(parsed.body.catalog)) {
            return json(res, 400, { error: 'invalid_catalog' });
        }

        const catalog = canonicalCatalog(parsed.body.catalog);
        let intent = parseCommandDeterministic(text, catalog);
        if (!intent) {
            try {
                const nimText = await callNim(
                    getNimApiKeys(),
                    NIM_TEXT_MODELS,
                    buildParsePrompt(text, catalog, lang),
                    300,
                    { reasoningEffort: 'low', timeoutMs: 12_000 },
                );
                intent = JSON.parse(nimText);
            } catch {
                return json(res, 422, { error: 'cannot_parse' });
            }
        }

        const validation = validatePresentIntent(intent, catalog);
        if (!validation.ok) {
            return json(res, 422, { error: 'cannot_parse' });
        }

        const command = buildPresentCommand(validation.intent, crypto.randomUUID(), Date.now());
        await storeCommand(command);
        return json(res, 200, { success: true, command });
    } catch (error) {
        console.error('Present command write error:', error);
        return json(res, 500, { error: 'Failed to save command' });
    }
}
