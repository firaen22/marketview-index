import crypto from 'crypto';
import { redis } from '../lib/redis.js';
import {
    type GlossaryLang,
    type GlossarySession,
    generateJoinCode,
    mergeTerms,
    normalizeJoinCode,
    publicSessionView,
} from '../lib/glossarySession.js';

const SESSION_PREFIX = 'glossary:sess:';
const LIVE_TTL_SECONDS = 12 * 60 * 60;
const ENDED_TTL_SECONDS = 7 * 24 * 60 * 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 30;
const MODES = ['all', 'gradual'];
const LANGS = ['en', 'zh-TW'];

function sessionKey(code: string): string {
    return `${SESSION_PREFIX}${code}`;
}

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

// Public caching is ONLY for the audience GET poll (the CDN absorbs concurrent
// viewers). Everything else — every non-200 and every POST, including the
// authenticated presenter actions that return the full session — is no-store.
function json(res: any, status: number, body: any, cacheable = false) {
    res.setHeader(
        'Cache-Control',
        cacheable && status === 200 ? 'public, s-maxage=3, stale-while-revalidate=5' : 'no-store',
    );
    return res.status(status).json(body);
}

function getIp(req: any): string {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0].trim() || 'unknown';
    return req.socket?.remoteAddress || 'unknown';
}

async function rateLimit(req: any): Promise<boolean> {
    if (!redis) return true;
    try {
        const key = `glossary_rl_${getIp(req)}`;
        const count = await redis.incr(key);
        if (count === 1 || (await redis.ttl(key)) === -1) {
            await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }
        return count <= RATE_LIMIT_MAX;
    } catch (error) {
        console.error('Glossary session rate limit error:', error);
        return true;
    }
}

async function readSession(code: string): Promise<GlossarySession | null> {
    const stored = await redis!.get(sessionKey(code));
    if (!stored) return null;
    if (typeof stored === 'string') return JSON.parse(stored) as GlossarySession;
    return stored as GlossarySession;
}

async function writeSession(session: GlossarySession, ttl: number): Promise<void> {
    await redis!.set(sessionKey(session.joinCode), JSON.stringify(session), { ex: ttl });
}

function validTerms(value: unknown): value is { term: string; explanation: string }[] {
    return Array.isArray(value)
        && value.length <= 10
        && value.every(item => (
            item
            && typeof item === 'object'
            && typeof (item as any).term === 'string'
            && typeof (item as any).explanation === 'string'
        ));
}

function validPage(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10000;
}

export default async function handler(req: any, res: any) {
    if (!redis) {
        return json(res, 503, { error: 'Storage not configured' });
    }

    if (req.method === 'GET') {
        const code = normalizeJoinCode(req.query?.code);
        if (!await rateLimit(req)) return json(res, 429, { error: 'rate_limited' });
        if (!code) return json(res, 400, { error: 'invalid_code' });

        try {
            const session = await readSession(code);
            if (!session || (session.status === 'ended' && !session.keepAfter)) {
                return json(res, 404, { error: 'not_found' });
            }
            return json(res, 200, { success: true, session: publicSessionView(session) }, true);
        } catch (error) {
            console.error('Glossary session read error:', error);
            return json(res, 500, { error: 'Failed to load session' });
        }
    }

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const parsed = parseBody(req.body);
    if (!parsed.ok || !parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) {
        return json(res, 400, { error: 'Invalid JSON body' });
    }

    const action = parsed.body.action;
    if (action !== 'join') {
        const requiredKey = process.env.PRESENT_API_KEY;
        if (!requiredKey) {
            return json(res, 503, { error: 'Server is missing PRESENT_API_KEY configuration' });
        }
        if (!authorize(req.headers?.['x-api-key'], requiredKey)) {
            return json(res, 401, { error: 'Unauthorized' });
        }
    }

    try {
        if (action === 'start') {
            if (!MODES.includes(parsed.body.mode)) return json(res, 400, { error: 'Invalid mode' });
            if (
                parsed.body.slideVersion !== undefined
                && (typeof parsed.body.slideVersion !== 'number' || !Number.isFinite(parsed.body.slideVersion))
            ) {
                return json(res, 400, { error: 'Invalid slideVersion' });
            }
            if (parsed.body.keepAfter !== undefined && typeof parsed.body.keepAfter !== 'boolean') {
                return json(res, 400, { error: 'Invalid keepAfter' });
            }

            let code = generateJoinCode();
            if (await redis.get(sessionKey(code))) {
                code = generateJoinCode();
                if (await redis.get(sessionKey(code))) {
                    return json(res, 500, { error: 'Could not allocate join code' });
                }
            }

            const now = Date.now();
            const session: GlossarySession = {
                joinCode: code,
                status: 'live',
                mode: parsed.body.mode,
                currentPage: 0,
                slideVersion: parsed.body.slideVersion ?? 0,
                startedAt: now,
                endedAt: null,
                keepAfter: parsed.body.keepAfter ?? true,
                joins: 0,
                terms: [],
                updatedAt: now,
            };
            await writeSession(session, LIVE_TTL_SECONDS);
            return json(res, 200, { success: true, session });
        }

        if (action === 'push') {
            const code = normalizeJoinCode(parsed.body.code);
            const lang = parsed.body.lang as GlossaryLang;
            if (!code) return json(res, 400, { error: 'invalid_code' });
            if (!validPage(parsed.body.page)) return json(res, 400, { error: 'Invalid page' });
            if (!LANGS.includes(lang)) return json(res, 400, { error: 'Invalid lang' });
            if (!validTerms(parsed.body.terms)) return json(res, 400, { error: 'Invalid terms' });

            const session = await readSession(code);
            if (!session) return json(res, 404, { error: 'not_found' });
            if (session.status === 'ended') return json(res, 409, { error: 'session_ended' });

            const now = Date.now();
            const merged = mergeTerms(session.terms, parsed.body.terms, lang, parsed.body.page, now);
            session.terms = merged.terms;
            session.currentPage = parsed.body.page;
            session.updatedAt = now;
            await writeSession(session, LIVE_TTL_SECONDS);
            return json(res, 200, { success: true, session, termLimitReached: merged.termLimitReached });
        }

        if (action === 'config') {
            const code = normalizeJoinCode(parsed.body.code);
            if (!code) return json(res, 400, { error: 'invalid_code' });
            if (parsed.body.mode !== undefined && !MODES.includes(parsed.body.mode)) {
                return json(res, 400, { error: 'Invalid mode' });
            }
            if (parsed.body.keepAfter !== undefined && typeof parsed.body.keepAfter !== 'boolean') {
                return json(res, 400, { error: 'Invalid keepAfter' });
            }

            const session = await readSession(code);
            if (!session) return json(res, 404, { error: 'not_found' });
            if (parsed.body.mode !== undefined) session.mode = parsed.body.mode;
            if (parsed.body.keepAfter !== undefined) session.keepAfter = parsed.body.keepAfter;
            session.updatedAt = Date.now();
            await writeSession(session, session.status === 'ended' ? ENDED_TTL_SECONDS : LIVE_TTL_SECONDS);
            return json(res, 200, { success: true, session });
        }

        if (action === 'end') {
            const code = normalizeJoinCode(parsed.body.code);
            if (!code) return json(res, 400, { error: 'invalid_code' });

            const session = await readSession(code);
            if (!session) return json(res, 404, { error: 'not_found' });
            if (session.keepAfter) {
                const now = Date.now();
                session.status = 'ended';
                session.endedAt = now;
                session.updatedAt = now;
                await writeSession(session, ENDED_TTL_SECONDS);
            } else {
                await redis.del(sessionKey(code));
            }
            return json(res, 200, { success: true });
        }

        if (action === 'reopen') {
            const code = normalizeJoinCode(parsed.body.code);
            if (!code) return json(res, 400, { error: 'invalid_code' });

            const session = await readSession(code);
            if (!session) return json(res, 404, { error: 'not_found' });
            const now = Date.now();
            session.status = 'live';
            session.endedAt = null;
            session.updatedAt = now;
            await writeSession(session, LIVE_TTL_SECONDS);
            return json(res, 200, { success: true, session });
        }

        if (action === 'join') {
            const code = normalizeJoinCode(parsed.body.code);
            if (!await rateLimit(req)) return json(res, 429, { error: 'rate_limited' });
            if (!code) return json(res, 400, { error: 'invalid_code' });

            const session = await readSession(code);
            if (!session) return json(res, 404, { error: 'not_found' });
            session.joins += 1;
            session.updatedAt = Date.now();
            // keepTtl, not a fresh ex: the unauthenticated beacon must never
            // extend a session's lifetime, or public joins could keep an ended
            // session alive forever.
            await redis.set(sessionKey(code), JSON.stringify(session), { keepTtl: true });
            return json(res, 200, { success: true });
        }

        return json(res, 400, { error: 'Unknown action' });
    } catch (error) {
        console.error('Glossary session write error:', error);
        return json(res, 500, { error: 'Failed to update session' });
    }
}
