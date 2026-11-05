import { z } from 'zod';
import { loadConfig, loadConfigForStatus } from './config.js';
import { fetchCommandCatalog } from './catalog.js';
import {
    fetchPresentSlide,
    fetchPresentStatus,
    postPresentCommand,
    requestAssist,
    savePresentSlide,
    sendNaturalLanguage,
    shouldWaitForAck,
    waitForCommandAck,
} from './presentClient.js';
import {
    PRESENT_RANGES,
    PRESENT_SLIDE_MODES,
    PresentApiError,
    type CatalogItem,
    type PresentCommand,
    type PresentLang,
} from './types.js';
import { PRESENT_INDEX_CATEGORY_VALUES } from './categoryLabels.js';
import { presentActionInputSchema } from './actionSchema.js';

export type ToolResult = { isError?: boolean; content: { type: 'text'; text: string }[] };

const langSchema = z.enum(['en', 'zh-TW']);

const presentStatusSchema = z.object({}).strict();

const presentSendSchema = z.object({
    text: z.string().min(1).max(200),
    lang: langSchema.default('en'),
    wait_for_ack: z.boolean().default(true),
}).strict();

const presentActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('view'), view: z.enum(['slide', 'index', 'heatmap']), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('range'), range: z.enum(PRESENT_RANGES), wait_for_ack: z.boolean().default(true) }),
    z.object({
        action: z.literal('category'),
        category: z.enum(PRESENT_INDEX_CATEGORY_VALUES),
        wait_for_ack: z.boolean().default(true),
    }),
    z.object({ action: z.literal('layout'), density: z.enum(['compact', 'comfortable', 'auto']), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('fullscreen'), mode: z.enum(['enter', 'exit']), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('highlight'), symbol: z.string().min(1).max(32), wait_for_ack: z.boolean().default(true) }),
    z.object({
        action: z.literal('compare'),
        symbols: z.array(z.string().min(1).max(24)).min(1).max(5),
        range: z.enum(PRESENT_RANGES).optional(),
        highlightFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        highlightTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        wait_for_ack: z.boolean().default(true),
    }),
    z.object({ action: z.literal('overlay'), src: z.string().min(1), caption: z.string().max(120).optional(), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('overlay_clear'), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('clear'), wait_for_ack: z.boolean().default(true) }),
    z.object({ action: z.literal('page'), direction: z.enum(['next', 'prev']) }),
]);

export function normalizeAssistText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Server bounds: api/present-command.ts ASSIST_MIN/MAX_TEXT_LEN, IMAGE_BASE64_MIN/MAX_LEN, slideId/deckKey validators. */
const presentAssistSchema = z.union([
    z.object({
        // Same normalization as lib/presentAssist.ts normalizeAssistText; the
        // server checks 40–6000 on the NORMALIZED text, so bound that, not raw.
        // No raw cap: only the normalized text (≤ 6000) is sent, and production checks only that.
        text: z.string().transform(normalizeAssistText).pipe(z.string().min(40).max(6000)),
        lang: langSchema.default('en'),
    }).strict(),
    z.object({
        imageBase64: z.string().min(100).max(3_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)
            .refine(v => v.length % 4 === 0, 'base64 length must be a multiple of 4'),
        slideId: z.string().regex(/^\d{1,15}#\d{1,5}$/),
        deckKey: z.string().min(1).max(2048),
        lang: langSchema.default('en'),
    }).strict(),
]);

/** Client parity: src/slideApi.ts MAX_CONTENT_BYTES (server allows 1M chars; client caps 256 KiB). */
export const SLIDE_MAX_CONTENT_BYTES = 256 * 1024;

const presentSlideSchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('get') }).strict(),
    z.object({
        op: z.literal('save'),
        mode: z.enum(PRESENT_SLIDE_MODES),
        content: z.string().refine(
            v => Buffer.byteLength(v, 'utf8') <= SLIDE_MAX_CONTENT_BYTES,
            `content exceeds ${SLIDE_MAX_CONTENT_BYTES} bytes`,
        ),
        updatedAt: z.number().int().positive().optional(),
    }).strict(),
]);

export const TOOL_SCHEMAS = {
    present_status: presentStatusSchema,
    present_send: presentSendSchema,
    present_action: presentActionSchema,
    present_assist: presentAssistSchema,
    present_slide: presentSlideSchema,
} as const;

function textResult(value: unknown, isError = false): ToolResult {
    return {
        ...(isError ? { isError: true } : {}),
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}

function errorResult(error: unknown): ToolResult {
    if (error instanceof PresentApiError) {
        return textResult({ error: error.message, status: error.status }, true);
    }
    if (error instanceof z.ZodError) {
        return textResult({ error: 'invalid_arguments', issues: error.issues }, true);
    }
    const message = error instanceof Error ? error.message : String(error);
    return textResult({ error: message }, true);
}

/**
 * Ack polling runs AFTER the POST succeeded, so its failures (429, timeout) must
 * not turn the tool result into an error — the command is already in the slot.
 */
async function maybeWaitAck(
    origin: string,
    command: PresentCommand,
    waitForAck: boolean,
): Promise<{
    acknowledged?: boolean;
    ackAttempts?: number;
    ackMs?: number;
    ackError?: string;
    status?: Awaited<ReturnType<typeof fetchPresentStatus>>;
}> {
    if (!waitForAck || !shouldWaitForAck(command)) {
        return {};
    }
    const started = Date.now();
    try {
        const ack = await waitForCommandAck(origin, command.id);
        return {
            acknowledged: ack.acknowledged,
            ackAttempts: ack.attempts,
            ackMs: Date.now() - started,
            status: ack.status,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = error instanceof PresentApiError ? error.status : undefined;
        return {
            acknowledged: false,
            ackMs: Date.now() - started,
            ackError: status === 429
                ? 'rate_limited during ack poll (90 GET/min/IP); command WAS posted — check present_status before resending'
                : `ack poll failed: ${message}; command WAS posted — check present_status before resending`,
        };
    }
}

export const TOOL_HANDLERS: Record<keyof typeof TOOL_SCHEMAS, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    present_status: async () => {
        try {
            const { origin } = loadConfigForStatus();
            const status = await fetchPresentStatus(origin);
            return textResult({
                projectorLive: status.projector !== null,
                projector: status.projector,
                projectorLast: status.projectorLast,
                applied: status.applied,
                control: status.control ?? null,
                commandSlot: status.command,
                serverTime: status.serverTime,
                notes: [
                    'Treat live projector.mode as on-screen truth; projectorLast when heartbeat expired.',
                    'Do not infer index on screen from command slot alone.',
                    'After writes, poll until applied.id === command.id (this tool on present_send/present_action does that when wait_for_ack=true).',
                    'control = last /present-control surface report (null when no control tab reported recently).',
                ],
            });
        } catch (error) {
            return errorResult(error);
        }
    },

    present_send: async (raw) => {
        try {
            const args = presentSendSchema.parse(raw);
            const { origin, apiKey } = loadConfig();
            const catalog = await fetchCommandCatalog(origin, args.lang as PresentLang);
            const command = await sendNaturalLanguage(origin, apiKey, args.text, args.lang as PresentLang, catalog);
            const ack = await maybeWaitAck(origin, command, args.wait_for_ack);
            return textResult({ command, ...ack });
        } catch (error) {
            return errorResult(error);
        }
    },

    present_action: async (raw) => {
        try {
            const args = presentActionSchema.parse(raw);
            const { origin, apiKey } = loadConfig();
            let body: Record<string, unknown>;
            let waitForAck = true;

            switch (args.action) {
                case 'view':
                    body = { action: 'view', view: args.view };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'range':
                    body = { action: 'range', range: args.range };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'category':
                    body = { action: 'category', category: args.category };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'layout':
                    body = { action: 'layout', density: args.density };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'fullscreen':
                    body = { action: 'fullscreen', mode: args.mode };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'highlight': {
                    const catalog = await fetchCommandCatalog(origin, 'en');
                    body = { action: 'highlight', symbol: args.symbol, catalog: catalog as CatalogItem[] };
                    waitForAck = args.wait_for_ack;
                    break;
                }
                case 'compare': {
                    const catalog = await fetchCommandCatalog(origin, 'en');
                    body = {
                        action: 'compare',
                        symbols: args.symbols,
                        catalog,
                        ...(args.range ? { range: args.range } : {}),
                        ...(args.highlightFrom && args.highlightTo
                            ? { highlightFrom: args.highlightFrom, highlightTo: args.highlightTo }
                            : {}),
                    };
                    waitForAck = args.wait_for_ack;
                    break;
                }
                case 'overlay':
                    body = { action: 'overlay', src: args.src, ...(args.caption ? { caption: args.caption } : {}) };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'overlay_clear':
                    body = { action: 'overlay', clear: true };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'clear':
                    body = { action: 'clear' };
                    waitForAck = args.wait_for_ack;
                    break;
                case 'page':
                    body = { action: 'page', direction: args.direction };
                    waitForAck = false;
                    break;
                default:
                    return textResult({ error: 'unsupported_action' }, true);
            }

            const payload = await postPresentCommand(origin, apiKey, body);
            const command = payload.command;
            const ack = await maybeWaitAck(origin, command, waitForAck);
            return textResult({ command, ...ack });
        } catch (error) {
            return errorResult(error);
        }
    },

    present_assist: async (raw) => {
        try {
            const args = presentAssistSchema.parse(raw);
            const { origin, apiKey } = loadConfig();
            const started = Date.now();
            const assist = await requestAssist(origin, apiKey, args);
            return textResult({ assist, mode: 'text' in args ? 'text' : 'vision', elapsedMs: Date.now() - started });
        } catch (error) {
            return errorResult(error);
        }
    },

    present_slide: async (raw) => {
        try {
            const args = presentSlideSchema.parse(raw);
            if (args.op === 'get') {
                const { origin } = loadConfigForStatus();
                const slide = await fetchPresentSlide(origin);
                return textResult({
                    slide: slide
                        ? { mode: slide.mode, updatedAt: slide.updatedAt, contentLength: slide.content.length, content: slide.content }
                        : null,
                });
            }
            const { origin, apiKey } = loadConfig();
            const slide = await savePresentSlide(origin, apiKey, {
                mode: args.mode,
                content: args.content,
                updatedAt: args.updatedAt ?? Date.now(),
            });
            return textResult({ saved: { mode: slide.mode, updatedAt: slide.updatedAt, contentLength: slide.content?.length ?? 0 } });
        } catch (error) {
            return errorResult(error);
        }
    },
};

export const TOOL_DEFINITIONS = [
    {
        name: 'present_status',
        description:
            'Read MarketView projector telemetry and command slot via GET /api/present-command. '
            + 'No API key. Use before chaining commands to see live mode, heartbeat, and last ack.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'present_send',
        description:
            'Natural-language presenter command (same as /present-control Copilot). '
            + 'Requires PRESENT_API_KEY. Builds catalog from live market-data + macro-data. '
            + 'Default wait_for_ack polls up to 8×1.5s; page turns skip ack.',
        inputSchema: {
            type: 'object',
            required: ['text'],
            properties: {
                text: { type: 'string', description: 'Command text, e.g. "show HSI", "HSI vs S&P YTD", "dashboard"' },
                lang: { type: 'string', enum: ['en', 'zh-TW'], default: 'en' },
                wait_for_ack: { type: 'boolean', default: true },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'present_action',
        description:
            'Structured presenter POST actions (oneOf schema): view, range, category, layout, fullscreen, highlight, compare, overlay, overlay_clear, clear, page. '
            + 'Requires PRESENT_API_KEY. Matches README bot curl shapes.',
        inputSchema: presentActionInputSchema,
    },
    {
        name: 'present_assist',
        description:
            'Presenter talking points for slide text or a slide image (POST action=assist; NIM, cached server-side). '
            + 'Requires PRESENT_API_KEY. Does NOT change the projector. Text mode: 40–6000 chars. '
            + 'Vision mode: imageBase64 (raw base64, no data: prefix) + slideId ("<deckMs>#<page>") + deckKey. Up to ~60 s on cold vision.',
        inputSchema: {
            type: 'object',
            oneOf: [
                {
                    type: 'object',
                    required: ['text'],
                    additionalProperties: false,
                    properties: {
                        // No minLength: JSON Schema counts code points, the server counts UTF-16 units after normalizing.
                        text: { type: 'string', description: 'Slide text to summarise; 40–6000 UTF-16 chars AFTER collapsing whitespace' },
                        lang: { type: 'string', enum: ['en', 'zh-TW'], default: 'en' },
                    },
                },
                {
                    type: 'object',
                    required: ['imageBase64', 'slideId', 'deckKey'],
                    additionalProperties: false,
                    properties: {
                        imageBase64: {
                            type: 'string', minLength: 100, maxLength: 3_000_000, // Equivalent to zod's char regex + length % 4 === 0.
                            pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$',
                            description: 'Raw base64 (no data: prefix); length a multiple of 4',
                        },
                        slideId: { type: 'string', pattern: '^\\d{1,15}#\\d{1,5}$' },
                        // No maxLength: JSON Schema counts code points, zod/server count UTF-16 units (≤ 2048).
                        deckKey: { type: 'string', minLength: 1, description: 'Deck identifier, ≤ 2048 UTF-16 code units' },
                        lang: { type: 'string', enum: ['en', 'zh-TW'], default: 'en' },
                    },
                },
            ],
        },
    },
    {
        name: 'present_slide',
        description:
            'Read or replace the saved presenter slide (GET/POST /api/present-slide). get: no key. '
            + 'save: requires PRESENT_API_KEY and REPLACES the live deck for every device (updatedAt defaults to now; a newer stored timestamp returns 409 stale). '
            + 'Modes: markdown | html | url | pdf (pdf content = /api/pdf-proxy URL; upload not supported here). Content ≤ 256 KiB.',
        inputSchema: {
            type: 'object',
            oneOf: [
                {
                    type: 'object',
                    required: ['op'],
                    additionalProperties: false,
                    properties: { op: { type: 'string', const: 'get' } },
                },
                {
                    type: 'object',
                    required: ['op', 'mode', 'content'],
                    additionalProperties: false,
                    properties: {
                        op: { type: 'string', const: 'save' },
                        mode: { type: 'string', enum: [...PRESENT_SLIDE_MODES] },
                        content: { type: 'string', maxLength: SLIDE_MAX_CONTENT_BYTES, description: '≤ 256 KiB UTF-8 (multi-byte text hits the byte cap before maxLength)' },
                        updatedAt: { type: 'integer', minimum: 1, description: 'Client ms timestamp; older than stored → 409 stale' },
                    },
                },
            ],
        },
    },
] as const;
