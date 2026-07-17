import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../lib/redis.js';
import { getClientIp } from '../lib/clientIp.js';
import { callNim, callNimHedged, getNimApiKeys, NIM_TEXT_MODELS, NIM_VISION_MODELS } from '../lib/nim.js';
import {
    ASSIST_MAX_TEXT_LEN,
    ASSIST_MIN_TEXT_LEN,
    assistCacheKey,
    buildAssistPrompt,
    buildAssistVisionPrompt,
    normalizeAssistText,
    validateAssistResult,
    type AssistResult,
} from '../lib/presentAssist.js';
import {
    buildParsePrompt,
    buildPresentCommand,
    type CatalogItem,
    isExecutablePresentCommand,
    parseCommandDeterministic,
    type PresentCommand,
    validatePresentIntent,
} from '../lib/presentCommand.js';

const COMMAND_KEY = 'present:cmd:v1';
// Page turns are RELATIVE commands: unlike chart/view/clear (absolute, safe to
// coalesce last-writer-wins), every tap must reach the projector or the net
// page offset is wrong. They get a queue, not the single command slot.
const PAGE_COMMANDS_KEY = 'present:pagecmd:v1';
const PAGE_COMMANDS_MAX_DRAIN = 20;
// Backlog cap (~2 drains): a stuck controller/macro must not bank hundreds of
// page turns that the projector then replays for minutes. Oldest are dropped —
// in an overflow the net offset is already wrong; bounding the damage wins.
const PAGE_COMMANDS_MAX_QUEUE = 40;
const PROJECTOR_STATE_KEY = 'present:pstate:v1';
const COMMAND_TTL_SECONDS = 120;
const PROJECTOR_STATE_TTL_SECONDS = 15;
const ASSIST_TTL_SECONDS = 2_592_000;
const RATE_LIMIT_WINDOW_SECONDS = 60;
// Projector poll (~24/min) and control poll (~15/min) can share one office NAT IP.
const RATE_LIMIT_MAX = 90;
const LANGS = ['en', 'zh-TW'];
const GROUPS = ['market', 'macro'];
const PROJECTOR_MODES = ['slide', 'pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;
// Duplicated from api/explain-jargon.ts:70-71; keep the client stricter.
const IMAGE_BASE64_MIN_LEN = 100;
const IMAGE_BASE64_MAX_LEN = 3_000_000;
// Matches api/explain-jargon.ts:212-221: 25s once killed a measured 42.6s
// slow-but-successful vision run, so each vision attempt gets 50s.
const VISION_TIMEOUT_MS = 50_000;
// Matches api/explain-jargon.ts:223-228: healthy vision lands ~5-9s and wins
// alone; slow spells escalate after 10s into the full race.
const HEDGE_DELAY_MS = 10_000;

interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
    at: number;
    lid?: string;
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

async function storeCommand(command: PresentCommand) {
    await redis!.set(COMMAND_KEY, JSON.stringify(command), { ex: COMMAND_TTL_SECONDS });
}

async function enqueuePageCommand(command: PresentCommand) {
    const length = await redis!.rpush(PAGE_COMMANDS_KEY, JSON.stringify(command));
    if (typeof length === 'number' && length > PAGE_COMMANDS_MAX_QUEUE) {
        await redis!.ltrim(PAGE_COMMANDS_KEY, length - PAGE_COMMANDS_MAX_QUEUE, -1);
    }
    await redis!.expire(PAGE_COMMANDS_KEY, COMMAND_TTL_SECONDS);
}

// Drained only by the projector's own poll (st=1): delivery consumes the
// queue, so taps are never coalesced away and never replayed after a reload.
async function drainPageCommands(): Promise<PresentCommand[]> {
    try {
        const items = await redis!.lpop<unknown>(PAGE_COMMANDS_KEY, PAGE_COMMANDS_MAX_DRAIN);
        if (items === null || items === undefined) return [];
        const list = Array.isArray(items) ? items : [items];
        const commands: PresentCommand[] = [];
        for (const item of list) {
            try {
                const parsed = parseStoredJson(item);
                if (isExecutablePresentCommand(parsed) && parsed.kind === 'page') commands.push(parsed);
            } catch {
                // A malformed entry must not drop the rest of the queue.
            }
        }
        return commands;
    } catch (error) {
        console.error('Present page command drain error:', error);
        return [];
    }
}

function oneQuery(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
}

function parseStrictInteger(value: unknown, min: number, max: number): number | null {
    const text = oneQuery(value);
    if (text === null || !/^(0|[1-9]\d*)$/.test(text)) return null;
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
    return parsed;
}

function validProjectorMode(value: unknown): ProjectorState['mode'] | null {
    const text = oneQuery(value);
    return typeof text === 'string' && (PROJECTOR_MODES as readonly string[]).includes(text) ? text as ProjectorState['mode'] : null;
}

function validLastExecutedId(value: unknown): string | null {
    const text = oneQuery(value);
    return typeof text === 'string' && text.length >= 1 && text.length <= 64 && /^[A-Za-z0-9-]+$/.test(text) ? text : null;
}

function validateProjectorState(value: unknown): ProjectorState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const mode = typeof raw.mode === 'string' && (PROJECTOR_MODES as readonly string[]).includes(raw.mode)
        ? raw.mode as ProjectorState['mode']
        : null;
    if (!mode) return null;
    if (typeof raw.page !== 'number' || !Number.isInteger(raw.page) || raw.page < 1 || raw.page > 2000) return null;
    if (typeof raw.v !== 'number' || !Number.isSafeInteger(raw.v) || raw.v < 0) return null;
    if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at) || raw.at < 0) return null;
    const lid = validLastExecutedId(raw.lid);
    return { mode, page: raw.page, v: raw.v, at: raw.at, ...(lid ? { lid } : {}) };
}

function parseStoredJson(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    return JSON.parse(value);
}

function projectorStateFromQuery(query: Record<string, unknown>, now: number): ProjectorState | null {
    if (oneQuery(query.st) !== '1') return null;
    const mode = validProjectorMode(query.mode);
    const page = parseStrictInteger(query.page, 1, 2000);
    const v = parseStrictInteger(query.v, 0, Number.MAX_SAFE_INTEGER);
    if (!mode || page === null || v === null) return null;
    const lid = validLastExecutedId(query.lid);
    return { mode, page, v, at: now, ...(lid ? { lid } : {}) };
}

async function readProjectorState(): Promise<ProjectorState | null> {
    try {
        const stored = await redis!.get(PROJECTOR_STATE_KEY);
        return validateProjectorState(parseStoredJson(stored));
    } catch {
        return null;
    }
}

async function readCommand() {
    try {
        const stored = await redis!.get(COMMAND_KEY);
        if (!stored) return null;
        const parsed = parseStoredJson(stored);
        return isExecutablePresentCommand(parsed) ? parsed : null;
    } catch (error) {
        console.error('Present command read error:', error);
        return null;
    }
}

function parseAssistPayload(value: unknown): AssistResult | null {
    try {
        return validateAssistResult(parseStoredJson(value));
    } catch {
        return null;
    }
}

export async function readAssistCache(key: string): Promise<AssistResult | null> {
    try {
        return parseAssistPayload(await redis!.get(key));
    } catch {
        return null;
    }
}

export async function writeAssistCache(key: string, assist: AssistResult): Promise<void> {
    try {
        await redis!.set(key, JSON.stringify(assist), { ex: ASSIST_TTL_SECONDS });
    } catch (error) {
        // A generated result is still good even if caching it failed.
        console.error('Present assist cache write error:', error);
    }
}

export function validatePresentAssistImageBase64(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    if (value.length < IMAGE_BASE64_MIN_LEN || value.length > IMAGE_BASE64_MAX_LEN) return null;
    if (value.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(value)) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    return value;
}

export function validatePresentAssistSlideId(value: unknown): string | null {
    return typeof value === 'string' && /^\d{1,15}#\d{1,5}$/.test(value) ? value : null;
}

export function validatePresentAssistDeckKey(value: unknown): string | null {
    return typeof value === 'string' && value.length >= 1 && value.length <= 2048 ? value : null;
}

export function presentAssistImageCacheKey(lang: 'en' | 'zh-TW', deckKey: string, slideId: string): string {
    return `present:assist:v1:img:${crypto.createHash('sha256').update(`${lang}\n${deckKey}\n${slideId}`).digest('hex')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!redis) {
        return json(res, 503, { error: 'Storage not configured' });
    }

    if (req.method === 'GET') {
        if (!await rateLimit(req)) return json(res, 429, { error: 'rate_limited' });
        const serverTime = Date.now();
        // A projector report MUTATES server state (state write + queue drain),
        // so it must carry the same soft-gate key as POST. Plain command polls
        // stay unauthenticated; an unkeyed st=1 probe degrades to a plain poll
        // instead of being able to consume page turns or forge visible state.
        const getKey = process.env.PRESENT_API_KEY;
        const projectorAuthed = !!getKey && authorize(req.headers?.['x-api-key'], getKey);
        const nextProjector = projectorAuthed ? projectorStateFromQuery(req.query as Record<string, unknown>, serverTime) : null;
        if (oneQuery((req.query as Record<string, unknown>).st) === '1' && nextProjector) {
            try {
                await redis.set(PROJECTOR_STATE_KEY, JSON.stringify(nextProjector), { ex: PROJECTOR_STATE_TTL_SECONDS });
            } catch (error) {
                console.error('Present projector state write error:', error);
            }
        }
        const hasProjectorReport = projectorAuthed && oneQuery((req.query as Record<string, unknown>).st) === '1';
        const [command, projector, pageCommands] = await Promise.all([
            readCommand(),
            hasProjectorReport ? Promise.resolve(nextProjector) : readProjectorState(),
            // Drain only for a VALID projector report: this GET is unauth by
            // design, so a bare st=1 probe (or a malformed poll) must not be
            // able to consume queued page turns meant for the projector.
            nextProjector ? drainPageCommands() : Promise.resolve([]),
        ]);
        // serverTime lets the projector judge staleness in SERVER time —
        // issuedAt is server-stamped, so a skewed projector clock must not
        // silently expire (or resurrect) every command.
        return json(res, 200, { success: true, command, serverTime, projector, pageCommands });
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

        if (parsed.body.action === 'page') {
            const direction = parsed.body.direction;
            if (direction !== 'next' && direction !== 'prev') {
                return json(res, 400, { error: 'invalid_direction' });
            }
            // Built directly, not via buildPresentCommand/NLU: this is a button
            // press, not free text, so there's no intent to parse.
            const command: PresentCommand = {
                v: 1,
                id: crypto.randomUUID(),
                kind: 'page',
                symbols: [],
                direction,
                issuedAt: Date.now(),
            };
            await enqueuePageCommand(command);
            return json(res, 200, { success: true, command });
        }

        if (parsed.body.action === 'assist') {
            const rawText = typeof parsed.body.text === 'string' ? parsed.body.text : '';
            // Validate the NORMALIZED length (mirrors client eligibility):
            // whitespace padding must not smuggle effectively-empty text into
            // a NIM call, and the cache key hashes normalized text anyway.
            const normalizedText = normalizeAssistText(rawText);
            if (normalizedText.length >= ASSIST_MIN_TEXT_LEN && normalizedText.length <= ASSIST_MAX_TEXT_LEN) {
                const lang = parsed.body.lang;
                if (!LANGS.includes(lang)) {
                    return json(res, 400, { error: 'Invalid lang' });
                }
                const cacheKey = assistCacheKey(normalizedText, lang);
                const cached = await readAssistCache(cacheKey);
                if (cached) return json(res, 200, { success: true, assist: cached });

                let assist: AssistResult | null = null;
                try {
                    const nimText = await callNim(
                        getNimApiKeys(),
                        NIM_TEXT_MODELS,
                        buildAssistPrompt(normalizedText, lang),
                        900,
                        { reasoningEffort: 'low', timeoutMs: 20_000 },
                    );
                    assist = validateAssistResult(JSON.parse(nimText));
                } catch {
                    assist = null;
                }
                if (!assist) return json(res, 422, { error: 'cannot_generate' });

                await writeAssistCache(cacheKey, assist);
                return json(res, 200, { success: true, assist });
            }

            if (!('imageBase64' in parsed.body)) {
                return json(res, 400, { error: 'invalid_text' });
            }

            const lang = parsed.body.lang;
            if (!LANGS.includes(lang)) {
                return json(res, 400, { error: 'Invalid lang' });
            }
            const slideId = validatePresentAssistSlideId(parsed.body.slideId);
            if (!slideId) {
                return json(res, 400, { error: 'invalid_slide_id' });
            }
            const deckKey = validatePresentAssistDeckKey(parsed.body.deckKey);
            if (!deckKey) {
                return json(res, 400, { error: 'invalid_deck_key' });
            }
            const imageBase64 = validatePresentAssistImageBase64(parsed.body.imageBase64);
            if (!imageBase64) {
                return json(res, 400, { error: 'invalid_image' });
            }

            const cacheKey = presentAssistImageCacheKey(lang, deckKey, slideId);
            const cached = await readAssistCache(cacheKey);
            if (cached) return json(res, 200, { success: true, assist: cached });

            let assist: AssistResult | null = null;
            try {
                const nimText = await callNimHedged(
                    getNimApiKeys(),
                    NIM_VISION_MODELS,
                    buildAssistVisionPrompt(imageBase64, lang),
                    900,
                    { timeoutMs: VISION_TIMEOUT_MS, hedgeDelayMs: HEDGE_DELAY_MS },
                );
                assist = validateAssistResult(JSON.parse(nimText));
            } catch {
                assist = null;
            }
            if (!assist) return json(res, 422, { error: 'cannot_generate' });

            await writeAssistCache(cacheKey, assist);
            return json(res, 200, { success: true, assist });
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
        // Stamped BEFORE any NLU await: used below to detect that a newer
        // command was stored while this one was still parsing.
        const receivedAt = Date.now();
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

        // A slow NLU parse must not overwrite a command the presenter issued
        // AFTER this one (send → NIM takes seconds → presenter hits clear →
        // the old send lands last and resurrects stale intent). issuedAt is
        // server-stamped, so anything stored after this request arrived wins.
        const existing = await readCommand();
        if (existing && existing.issuedAt > receivedAt) {
            return json(res, 409, { error: 'superseded' });
        }
        const command = buildPresentCommand(validation.intent, crypto.randomUUID(), Date.now());
        await storeCommand(command);
        return json(res, 200, { success: true, command });
    } catch (error) {
        console.error('Present command write error:', error);
        return json(res, 500, { error: 'Failed to save command' });
    }
}
