import { z } from 'zod';
import { loadConfig, loadConfigForStatus } from './config.js';
import { fetchCommandCatalog } from './catalog.js';
import {
    fetchPresentStatus,
    postPresentCommand,
    sendNaturalLanguage,
    shouldWaitForAck,
    waitForCommandAck,
} from './presentClient.js';
import {
    PRESENT_RANGES,
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

export const TOOL_SCHEMAS = {
    present_status: presentStatusSchema,
    present_send: presentSendSchema,
    present_action: presentActionSchema,
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

async function maybeWaitAck(
    origin: string,
    command: PresentCommand,
    waitForAck: boolean,
): Promise<{ acknowledged?: boolean; ackAttempts?: number; status?: Awaited<ReturnType<typeof fetchPresentStatus>> }> {
    if (!waitForAck || !shouldWaitForAck(command)) {
        return {};
    }
    const ack = await waitForCommandAck(origin, command.id);
    return {
        acknowledged: ack.acknowledged,
        ackAttempts: ack.attempts,
        status: ack.status,
    };
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
                commandSlot: status.command,
                serverTime: status.serverTime,
                notes: [
                    'Treat live projector.mode as on-screen truth; projectorLast when heartbeat expired.',
                    'Do not infer index on screen from command slot alone.',
                    'After writes, poll until applied.id === command.id (this tool on present_send/present_action does that when wait_for_ack=true).',
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
] as const;
