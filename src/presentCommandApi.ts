import type { CatalogItem, PageDirection, PresentCommand } from '../lib/presentCommand';
import { isExecutablePresentCommand } from '../lib/presentCommand';
import type { AssistResult } from '../lib/presentAssist';
import { validateAssistResult } from '../lib/presentAssist';

const API_KEY = import.meta.env.VITE_PRESENT_API_KEY;
const PROJECTOR_MODES = ['slide', 'pdf', 'markdown', 'html', 'url', 'index', 'heatmap'] as const;

export interface ProjectorState {
    mode: typeof PROJECTOR_MODES[number];
    page: number;
    v: number;
    at: number;
    lid?: string;
}

if (import.meta.env.DEV && import.meta.env.MODE !== 'test' && !API_KEY) {
    console.warn('VITE_PRESENT_API_KEY not set — present command writes may fail');
}

function authHeaders(): Record<string, string> {
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

function isProjectorState(value: unknown): value is ProjectorState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const raw = value as Record<string, unknown>;
    return typeof raw.mode === 'string'
        && (PROJECTOR_MODES as readonly string[]).includes(raw.mode)
        && typeof raw.page === 'number'
        && Number.isInteger(raw.page)
        && raw.page >= 1
        && raw.page <= 2000
        && typeof raw.v === 'number'
        && Number.isSafeInteger(raw.v)
        && raw.v >= 0
        && typeof raw.at === 'number'
        && Number.isSafeInteger(raw.at)
        && raw.at >= 0
        && (raw.lid === undefined || (typeof raw.lid === 'string' && raw.lid.length >= 1 && raw.lid.length <= 64 && /^[A-Za-z0-9-]+$/.test(raw.lid)));
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

export async function sendPresentPageCommand(direction: PageDirection, signal?: AbortSignal): Promise<PresentCommand> {
    const payload = await postPresentCommand({ action: 'page', direction }, signal);
    return toCommand(payload);
}

export async function fetchProjectorState(signal?: AbortSignal): Promise<{ projector: ProjectorState | null; serverTime: number }> {
    const response = await fetch('/api/present-command', { signal });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new PresentCommandApiError(response.status, payload?.error || `Present command failed (${response.status})`);
    }
    const serverTime = typeof payload?.serverTime === 'number' && Number.isFinite(payload.serverTime)
        ? payload.serverTime
        : Date.now();
    const projector = isProjectorState(payload?.projector) ? payload.projector : null;
    return { projector, serverTime };
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
