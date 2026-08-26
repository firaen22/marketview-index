import { redis } from './redis.js';
import { incrementRateLimit } from './rateLimit.js';
import { isValidJoinCode } from './glossarySession.js';

// Permanent-QR resolver. The printed QR encodes `${origin}/j`, which vercel.json
// rewrites onto /api/glossary-session?resolve=current — it lives inside that
// function rather than its own /api/join because the Hobby plan caps a
// deployment at 12 Serverless Functions and the project is at the cap. The
// glossary-session function is the natural host: it already owns the pointer.
//
// This path is public and must never 500 at a scanner: every failure degrades
// to the /join waiting page.
export const CURRENT_KEY = 'glossary:current';
const SESSION_PREFIX = 'glossary:sess:';
const RATE_LIMIT_WINDOW_SECONDS = 60;
// A whole conference room NATs to one client IP and scans within seconds, so
// this is deliberately far above the presenter API's 30/min limit.
const RATE_LIMIT_MAX = 240;

// Delete the pointer only if it still holds the code we just found stale AND
// the session has not gone live again in the meantime — a reopen between our
// session read and this delete must not lose its freshly re-advertised pointer.
// Sessions are written with JSON.stringify (no spaces), so the plain-text
// status marker below is a reliable liveness probe inside the script.
export const POINTER_COMPARE_AND_DELETE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    local sess = redis.call('GET', KEYS[2])
    if not sess or not string.find(sess, '"status":"live"', 1, true) then
        return redis.call('DEL', KEYS[1])
    end
end
return 0
`;

async function rateLimit(req: any): Promise<boolean> {
    if (!redis) return true;
    try {
        const count = await incrementRateLimit(redis, req, 'glossary_join_rl', RATE_LIMIT_WINDOW_SECONDS);
        return count <= RATE_LIMIT_MAX;
    } catch (error) {
        console.error('Join rate limit error:', error);
        return true;
    }
}

function noStore(res: any) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

// 302, never 301: browsers cache 301 permanently and would pin every future
// scan of the printed QR to a dead session. Targets are relative paths only.
function redirect(res: any, path: string) {
    noStore(res);
    res.setHeader('Location', path);
    return res.status(302).end();
}

// Resolve the pointer to a live session's join code, or null. Fail closed:
// a corrupt/hostile pointer value must never reach a Location header.
async function resolveLiveCode(): Promise<string | null> {
    if (!redis) return null;
    const stored = await redis.get(CURRENT_KEY);
    // Upstash auto-deserializes: an all-digit code like "23456789" comes back
    // as a number (its round-trip guard means String() recovers it exactly).
    const code = typeof stored === 'string'
        ? stored
        : typeof stored === 'number' && Number.isSafeInteger(stored)
            ? String(stored)
            : null;
    if (!code || !isValidJoinCode(code)) return null;
    const rawSession = await redis.get(`${SESSION_PREFIX}${code}`);
    // A corrupt blob must land in the stale branch below (so it self-heals),
    // not throw past it.
    let session: unknown = rawSession;
    if (typeof rawSession === 'string') {
        try {
            session = JSON.parse(rawSession);
        } catch {
            session = null;
        }
    }
    if (!session || typeof session !== 'object' || (session as { status?: unknown }).status !== 'live') {
        // Stale pointer (session expired/ended/corrupt): self-heal so the next
        // scan short-circuits, but never fail the response over it.
        try {
            await redis.eval(POINTER_COMPARE_AND_DELETE, [CURRENT_KEY, `${SESSION_PREFIX}${code}`], [code]);
        } catch (error) {
            console.error('Join pointer cleanup error:', error);
        }
        return null;
    }
    return code;
}

export default async function handleJoinResolve(req: any, res: any) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        noStore(res);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const wantsJson = req.method === 'GET' && req.query?.format === 'json';

    if (!await rateLimit(req)) {
        // Pollers read 429 as a miss and back off; a QR scanner instead
        // degrades to the /join waiting page like every other failure path —
        // never a raw JSON error on a phone screen.
        if (wantsJson) {
            noStore(res);
            return res.status(429).json({ error: 'rate_limited' });
        }
        return redirect(res, '/join');
    }

    let code: string | null = null;
    try {
        code = await resolveLiveCode();
    } catch (error) {
        console.error('Join resolve error:', error);
        code = null;
    }

    // JSON mode (the /join waiting page's poll) always answers 200, never
    // redirects — a poller that got a redirect would loop. Short-cacheable so
    // the CDN absorbs a whole room polling through one NAT IP, mirroring the
    // audience GET poll in glossary-session.
    if (wantsJson) {
        res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=5');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        return res.status(200).json({ code });
    }

    return redirect(res, code ? `/session/${code}` : '/join');
}
