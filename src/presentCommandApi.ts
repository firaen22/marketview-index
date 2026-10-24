import {
    PRESENT_RANGES,
    type CatalogItem,
    type PageDirection,
    type PresentCommand,
    type PresentFullscreenMode,
    type PresentIndexDensity,
    type PresentRange,
    type PresentView,
} from '../lib/presentCommand';
import { isExecutablePresentCommand } from '../lib/presentCommand';
import type { AssistResult } from '../lib/presentAssist';
import { validateAssistResult } from '../lib/presentAssist';
import { type ControlSurfaceState, type ProjectorDisplay, validateProjectorDisplay } from '../lib/presentDisplay';
import { isPresentFullscreenMode, isPresentIndexDensity } from '../lib/presentIndexView';

export type { ControlSurfaceState } from '../lib/presentDisplay';

const API_KEY = import.meta.env.VITE_PRESENT_API_KEY;
const PROJECTOR_MODES = ['slide', 'pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;

export interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
    at: number;
    lid?: string;
    display?: ProjectorDisplay;
}

export interface ProjectorLastState extends ProjectorState {
    stale: boolean;
    ageMs: number;
}

export interface PresentAppliedState {
    id: string;
    kind: PresentCommand['kind'];
    at: number;
    view?: PresentView;
    density?: PresentIndexDensity;
    fsMode?: PresentFullscreenMode;
    symbol?: string;
    range?: PresentRange;
}

if (import.meta.env.DEV && import.meta.env.MODE !== 'test' && !API_KEY) {
    console.warn('VITE_PRESENT_API_KEY not set — present command writes may fail');
}

// Also used by the projector poll (usePresentCommand): st=1 reports mutate
// server state, so the server only honors them when this key is present.
export function authHeaders(): Record<string, string> {
    return API_KEY ? { 'x-api-key': API_KEY } : {};
}

export class PresentCommandApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'PresentCommandApiError';
        this.status = status;
    }
}

async function readJson(response: Response): Promise<any> {
    return response.json().catch(() => ({}));
}

async function postPresentCommand(body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    const response = await fetch('/api/present-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
        signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new PresentCommandApiError(response.status, payload?.error || `Present command failed (${response.status})`);
    }
    return payload;
}

function parseProjectorState(value: unknown): ProjectorState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.mode !== 'string' || !(PROJECTOR_MODES as readonly string[]).includes(raw.mode)) return null;
    if (typeof raw.page !== 'number' || !Number.isInteger(raw.page) || raw.page < 1 || raw.page > 2000) return null;
    if (typeof raw.v !== 'number' || !Number.isSafeInteger(raw.v) || raw.v < 0) return null;
    if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at) || raw.at < 0) return null;
    const lid = raw.lid === undefined
        ? undefined
        : (typeof raw.lid === 'string' && raw.lid.length >= 1 && raw.lid.length <= 64 && /^[A-Za-z0-9-]+$/.test(raw.lid) ? raw.lid : null);
    if (raw.lid !== undefined && lid === null) return null;
    const display = raw.display === undefined ? undefined : validateProjectorDisplay(raw.display) ?? undefined;
    return {
        mode: raw.mode as ProjectorState['mode'],
        page: raw.page,
        v: raw.v,
        at: raw.at,
        ...(lid ? { lid } : {}),
        ...(display ? { display } : {}),
    };
}

// A 200 whose command doesn't pass the executor validator is a malformed
// success — surface it as an error instead of feeding it to the UI.
function toCommand(payload: any): PresentCommand {
    if (!isExecutablePresentCommand(payload?.command)) {
        throw new PresentCommandApiError(502, 'malformed_command');
    }
    return payload.command;
}

export async function sendPresentCommand(
    text: string,
    lang: 'en' | 'zh-TW',
    catalog: CatalogItem[],
    signal?: AbortSignal,
): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'send', text, lang, catalog }, signal);
    return toCommand(payload);
}

export async function clearPresentCommand(signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'clear' }, signal);
    return toCommand(payload);
}

export async function sendPresentCompare(
    body: {
        symbols: string[];
        range?: string;
        highlightFrom?: string;
        highlightTo?: string;
        catalog?: CatalogItem[];
    },
    signal?: AbortSignal,
): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'compare', ...body }, signal);
    return toCommand(payload);
}

export async function sendPresentOverlay(src: string, caption?: string, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({
        action: 'overlay',
        src,
        ...(caption ? { caption } : {}),
    }, signal);
    return toCommand(payload);
}

export async function clearPresentOverlay(signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'overlay', clear: true }, signal);
    return toCommand(payload);
}

export async function sendPresentPageCommand(direction: PageDirection, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'page', direction }, signal);
    return toCommand(payload);
}

export async function sendPresentView(view: PresentView, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'view', view }, signal);
    return toCommand(payload);
}

export async function sendPresentIndexLayout(density: PresentIndexDensity, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'layout', density }, signal);
    return toCommand(payload);
}

export async function sendPresentFullscreen(mode: PresentFullscreenMode, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'fullscreen', mode }, signal);
    return toCommand(payload);
}

export async function sendPresentRange(range: string, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'range', range }, signal);
    return toCommand(payload);
}

export async function sendPresentHighlight(
    symbol: string,
    catalog?: CatalogItem[],
    signal?: AbortSignal,
): Promise<PresentCommand> {
    const payload = await postPresentCommand({
        action: 'highlight',
        symbol,
        ...(catalog ? { catalog } : {}),
    }, signal);
    return toCommand(payload);
}

function parseProjectorLast(value: unknown): ProjectorLastState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const core = parseProjectorState(raw);
    if (!core) return null;
    if (typeof raw.stale !== 'boolean') return null;
    if (typeof raw.ageMs !== 'number' || !Number.isFinite(raw.ageMs) || raw.ageMs < 0) return null;
    return { ...core, stale: raw.stale, ageMs: raw.ageMs };
}

function parsePresentApplied(value: unknown): PresentAppliedState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 64) return null;
    if (typeof raw.kind !== 'string' || typeof raw.at !== 'number' || !Number.isFinite(raw.at)) return null;
    const applied: PresentAppliedState = {
        id: raw.id,
        kind: raw.kind as PresentAppliedState['kind'],
        at: raw.at,
    };
    if (raw.view !== undefined) {
        if (raw.view !== 'slide' && raw.view !== 'index' && raw.view !== 'heatmap') return null;
        applied.view = raw.view;
    }
    if (raw.density !== undefined) {
        if (!isPresentIndexDensity(raw.density)) return null;
        applied.density = raw.density;
    }
    if (raw.fsMode !== undefined) {
        if (!isPresentFullscreenMode(raw.fsMode)) return null;
        applied.fsMode = raw.fsMode;
    }
    if (typeof raw.symbol === 'string') applied.symbol = raw.symbol;
    if (raw.range !== undefined) {
        const rangeKey = typeof raw.range === 'string' ? raw.range.toUpperCase() : null;
        if (!rangeKey || !PRESENT_RANGES.includes(rangeKey as PresentRange)) return null;
        applied.range = rangeKey as PresentRange;
    }
    return applied;
}

function parseControlSurface(value: unknown): ControlSurfaceState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at) || raw.at < 0) return null;
    const display = raw.display === undefined ? undefined : validateProjectorDisplay(raw.display) ?? undefined;
    if (!display) return null;
    return { at: raw.at, display };
}

export async function fetchProjectorState(signal?: AbortSignal): Promise<{
    projector: ProjectorState | null;
    projectorLast: ProjectorLastState | null;
    applied: PresentAppliedState | null;
    control: ControlSurfaceState | null;
    serverTime: number;
}> {
    const response = await fetch('/api/present-command', { signal });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new PresentCommandApiError(response.status, payload?.error || `Present command failed (${response.status})`);
    }
    const serverTime = typeof payload?.serverTime === 'number' && Number.isFinite(payload.serverTime)
        ? payload.serverTime
        : Date.now();
    const projector = parseProjectorState(payload?.projector);
    const projectorLast = parseProjectorLast(payload?.projectorLast);
    const applied = parsePresentApplied(payload?.applied);
    const control = parseControlSurface(payload?.control);
    return { projector, projectorLast, applied, control, serverTime };
}

export async function fetchAssist(text: string, lang: 'en' | 'zh-TW', signal?: AbortSignal): Promise<AssistResult> {
    const payload = await postPresentCommand({ action: 'assist', text, lang }, signal);
    const assist = validateAssistResult(payload?.assist);
    if (!assist) {
        throw new PresentCommandApiError(502, 'malformed_assist');
    }
    return assist;
}

export async function fetchAssistImage(
    imageBase64: string,
    slideId: string,
    deckKey: string,
    lang: 'en' | 'zh-TW',
    signal?: AbortSignal,
): Promise<AssistResult> {
    const payload = await postPresentCommand({ action: 'assist', imageBase64, slideId, deckKey, lang }, signal);
    const assist = validateAssistResult(payload?.assist);
    if (!assist) {
        throw new PresentCommandApiError(502, 'malformed_assist');
    }
    return assist;
}
