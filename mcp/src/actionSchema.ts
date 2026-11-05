import { PRESENT_INDEX_CATEGORY_VALUES } from './categoryLabels.js';
import { PRESENT_RANGES } from './types.js';

const waitForAckProp = {
    wait_for_ack: {
        type: 'boolean',
        description: 'Poll GET until applied.id or projector.lid matches (default true). Page always skips.',
        default: true,
    },
};

/** MCP tool JSON Schema — mirrors zod `presentActionSchema` one branch per action. */
export const presentActionInputSchema = {
    type: 'object',
    oneOf: [
        {
            type: 'object',
            required: ['action', 'view'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'view' },
                view: { type: 'string', enum: ['slide', 'index', 'heatmap'] },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'range'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'range' },
                range: { type: 'string', enum: [...PRESENT_RANGES] },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'category'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'category' },
                category: { type: 'string', enum: [...PRESENT_INDEX_CATEGORY_VALUES] },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'density'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'layout' },
                density: { type: 'string', enum: ['compact', 'comfortable', 'auto'] },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'mode'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'fullscreen' },
                mode: { type: 'string', enum: ['enter', 'exit'] },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'symbol'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'highlight' },
                symbol: { type: 'string', description: 'Quote symbol e.g. ^HSI' },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'symbols'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'compare' },
                symbols: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 5,
                    items: { type: 'string' },
                },
                range: { type: 'string', enum: [...PRESENT_RANGES] },
                highlightFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                highlightTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            description:
                'Do not call. Custom image overlays on /present cause live-session errors (2026-11-05). '
                + 'Use present_send (e.g. "show JP10Y") or compare.',
            required: ['action', 'src'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'overlay' },
                src: {
                    type: 'string',
                    description: 'Do not send. An https or data:image URL here is a custom overlay.',
                },
                caption: { type: 'string', maxLength: 120 },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            description: 'Remove an image overlay already on the PDF. Does not add a graphic.',
            required: ['action'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'overlay_clear' },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'clear' },
                ...waitForAckProp,
            },
        },
        {
            type: 'object',
            required: ['action', 'direction'],
            additionalProperties: false,
            properties: {
                action: { type: 'string', const: 'page' },
                direction: { type: 'string', enum: ['next', 'prev'] },
            },
        },
    ],
} as const;
