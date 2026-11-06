import type {
    AssistResult,
    CatalogItem,
    PresentCommand,
    PresentLang,
    PresentSlide,
    PresentSlideMode,
    PresentStatusPayload,
    AckWaitResult,
} from './types.js';
import { PresentApiError } from './types.js';

/** Max ack GETs per command — same rate budget as CopilotBar (8). */
export const ACK_MAX_ATTEMPTS = 8;
/** Legacy fixed interval (CopilotBar); kept as the tail of the schedule. */
export const ACK_POLL_INTERVAL_MS = 1500;
/**
 * Sleep before each ack GET. The projector polls every 1000–1800 ms and flushes
 * `lid` ~50 ms after applying, so an immediate GET can never see the ack; dense
 * early checks catch the typical 1–2.5 s ack, the 1.5 s tail keeps the 8-GET
 * budget (~10 s wall) of the old fixed loop. Sum = 9.9 s.
 */
export const ACK_POLL_SCHEDULE_MS = [700, 700, 1000, 1500, 1500, 1500, 1500, 1500] as const;

/** Per-request timeouts — a hung upstream must never stall an MCP tool call. */
export const STATUS_TIMEOUT_MS = 5_000;
export const POST_TIMEOUT_MS = 20_000;
/** Server-side vision NIM budget is 50 s (api/present-command.ts VISION_TIMEOUT_MS). */
export const ASSIST_TIMEOUT_MS = 60_000;
export const SLIDE_TIMEOUT_MS = 15_000;

export type FetchLike = typeof fetch;

function authHeaders(apiKey: string): Record<string, string> {
    return apiKey ? { 'x-api-key': apiKey } : {};
}

/**
 * fetch + body read under ONE hard timeout (a 200 whose body stalls must time out,
 * not parse as `{}`). Timeout → PresentApiError(504, '<label>_timeout').
 * Non-JSON body on a 2xx → PresentApiError(502, '<label>_malformed_json');
 * on a non-2xx the payload degrades to `{}` so the HTTP status still surfaces.
 */
export async function requestJson(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    timeoutMs: number,
    label: string,
    signal?: AbortSignal,
    allowNonObject2xx = false,
): Promise<{ response: Response; payload: Record<string, unknown> }> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const timedOut = () => timeout.aborted && !signal?.aborted;
    let response: Response;
    let text: string;
    try {
        response = await fetchImpl(url, { ...init, signal: combined });
        text = await response.text();
    } catch (error) {
        if (timedOut()) throw new PresentApiError(504, `${label}_timeout after ${timeoutMs}ms`);
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        if (response.ok) throw new PresentApiError(502, `${label}_malformed_json`);
        parsed = {};
    }
    const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    if (!payload) {
        if (response.ok && !allowNonObject2xx) throw new PresentApiError(502, `${label}_malformed_json`);
        if (response.ok) return { response, payload: parsed as Record<string, unknown> };
        return { response, payload: {} };
    }
    return { response, payload };
}

export async function fetchPresentStatus(
    origin: string,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<PresentStatusPayload> {
    const { response, payload } = await requestJson(
        fetchImpl, `${origin}/api/present-command`, {}, STATUS_TIMEOUT_MS, 'status', signal,
    );
    if (!response.ok) {
        throw new PresentApiError(response.status, String(payload?.error ?? `present-command GET failed (${response.status})`));
    }
    if (
        payload.projector !== null
        && (typeof payload.projector !== 'object' || Array.isArray(payload.projector))
    ) {
        throw new PresentApiError(502, 'status_malformed_json');
    }
    return payload as unknown as PresentStatusPayload;
}

async function postJson(
    origin: string,
    path: string,
    apiKey: string,
    body: Record<string, unknown>,
    fetchImpl: FetchLike,
    timeoutMs: number,
    label: string,
    signal?: AbortSignal,
): Promise<Record<string, unknown>> {
    const { response, payload } = await requestJson(fetchImpl, `${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
        body: JSON.stringify(body),
    }, timeoutMs, label, signal);
    if (!response.ok) {
        throw new PresentApiError(response.status, String(payload?.error ?? `${path} POST failed (${response.status})`));
    }
    return payload;
}

export async function postPresentCommand(
    origin: string,
    apiKey: string,
    body: Record<string, unknown>,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<{ command: PresentCommand } & Record<string, unknown>> {
    const payload = await postJson(origin, '/api/present-command', apiKey, body, fetchImpl, POST_TIMEOUT_MS, 'command', signal);
    const command = payload?.command;
    if (
        !command
        || typeof command !== 'object'
        || Array.isArray(command)
        || typeof (command as { id?: unknown }).id !== 'string'
        || (command as { id: string }).id.length === 0
    ) {
        throw new PresentApiError(502, 'malformed_command');
    }
    return payload as { command: PresentCommand } & Record<string, unknown>;
}

export function isCommandAcked(status: PresentStatusPayload, commandId: string): boolean {
    if (typeof commandId !== 'string' || commandId.length === 0) return false;
    return status.applied?.id === commandId || status.projector?.lid === commandId;
}

/** Page turns never set projector lid — skip ack wait (see CopilotBar). */
export function shouldWaitForAck(command: PresentCommand): boolean {
    return command.kind !== 'page';
}

export async function waitForCommandAck(
    origin: string,
    commandId: string,
    fetchImpl: FetchLike = fetch,
    options?: { intervalMs?: number; maxAttempts?: number; scheduleMs?: readonly number[]; signal?: AbortSignal },
): Promise<AckWaitResult> {
    const maxAttempts = options?.maxAttempts ?? ACK_MAX_ATTEMPTS;
    const schedule = options?.scheduleMs
        ?? (options?.intervalMs !== undefined ? [] : ACK_POLL_SCHEDULE_MS);
    const tail = options?.intervalMs ?? ACK_POLL_INTERVAL_MS;
    let lastStatus: PresentStatusPayload | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await sleep(schedule[attempt] ?? tail, options?.signal);
        lastStatus = await fetchPresentStatus(origin, fetchImpl, options?.signal);
        if (isCommandAcked(lastStatus, commandId)) {
            return { acknowledged: true, attempts: attempt + 1, status: lastStatus };
        }
    }
    if (!lastStatus) throw new PresentApiError(500, 'ack_wait_no_attempts');
    return { acknowledged: false, attempts: maxAttempts, status: lastStatus };
}

export async function sendNaturalLanguage(
    origin: string,
    apiKey: string,
    text: string,
    lang: PresentLang,
    catalog: CatalogItem[],
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<PresentCommand> {
    const payload = await postPresentCommand(origin, apiKey, {
        action: 'send',
        text,
        lang,
        catalog,
    }, fetchImpl, signal);
    return payload.command;
}

export type AssistRequest =
    | { text: string; lang: PresentLang }
    | { imageBase64: string; slideId: string; deckKey: string; lang: PresentLang };

/** POST action=assist (text or vision). Read-only for the projector: no command slot write. */
export async function requestAssist(
    origin: string,
    apiKey: string,
    request: AssistRequest,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<AssistResult> {
    const payload = await postJson(
        origin, '/api/present-command', apiKey, { action: 'assist', ...request },
        fetchImpl, ASSIST_TIMEOUT_MS, 'assist', signal,
    );
    const assist = payload?.assist as AssistResult | undefined;
    if (!assist || !Array.isArray(assist.points)) {
        throw new PresentApiError(502, 'malformed_assist');
    }
    return assist;
}

export async function fetchPresentSlide(
    origin: string,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<PresentSlide | null> {
    const { response, payload } = await requestJson(
        fetchImpl, `${origin}/api/present-slide`, {}, SLIDE_TIMEOUT_MS, 'slide_get', signal, true,
    );
    if (!response.ok) {
        throw new PresentApiError(response.status, String(payload?.error ?? `present-slide GET failed (${response.status})`));
    }
    if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || !Object.prototype.hasOwnProperty.call(payload, 'slide')
    ) {
        throw new PresentApiError(502, 'malformed_slide');
    }
    const slide = payload.slide;
    if (
        slide !== null
        && (
            typeof slide !== 'object'
            || Array.isArray(slide)
            || typeof (slide as { content?: unknown }).content !== 'string'
            || typeof (slide as { mode?: unknown }).mode !== 'string'
            || typeof (slide as { updatedAt?: unknown }).updatedAt !== 'number'
            || !Number.isFinite((slide as { updatedAt: number }).updatedAt)
        )
    ) {
        throw new PresentApiError(502, 'malformed_slide');
    }
    return slide as PresentSlide | null;
}

export async function savePresentSlide(
    origin: string,
    apiKey: string,
    slide: { mode: PresentSlideMode; content: string; updatedAt: number },
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<PresentSlide> {
    const payload = await postJson(
        origin, '/api/present-slide', apiKey, slide, fetchImpl, SLIDE_TIMEOUT_MS, 'slide_save', signal,
    );
    const saved = payload?.slide as PresentSlide | undefined;
    if (
        !saved
        || typeof saved !== 'object'
        || Array.isArray(saved)
        || typeof saved.content !== 'string'
        || typeof saved.mode !== 'string'
        || typeof saved.updatedAt !== 'number'
        || !Number.isFinite(saved.updatedAt)
    ) throw new PresentApiError(502, 'malformed_slide');
    return saved;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
