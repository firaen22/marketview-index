import type {
    CatalogItem,
    PresentCommand,
    PresentLang,
    PresentStatusPayload,
    AckWaitResult,
} from './types.js';
import { PresentApiError } from './types.js';

/** Matches CopilotBar ack polling (8 × 1500 ms). */
export const ACK_POLL_INTERVAL_MS = 1500;
export const ACK_MAX_ATTEMPTS = 8;

export type FetchLike = typeof fetch;

function authHeaders(apiKey: string): Record<string, string> {
    return apiKey ? { 'x-api-key': apiKey } : {};
}

async function readJson(response: Response): Promise<unknown> {
    return response.json().catch(() => ({}));
}

export async function fetchPresentStatus(
    origin: string,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<PresentStatusPayload> {
    const response = await fetchImpl(`${origin}/api/present-command`, { signal });
    const payload = await readJson(response) as Record<string, unknown>;
    if (!response.ok) {
        throw new PresentApiError(response.status, String(payload?.error ?? `present-command GET failed (${response.status})`));
    }
    return payload as unknown as PresentStatusPayload;
}

export async function postPresentCommand(
    origin: string,
    apiKey: string,
    body: Record<string, unknown>,
    fetchImpl: FetchLike = fetch,
    signal?: AbortSignal,
): Promise<{ command: PresentCommand } & Record<string, unknown>> {
    const response = await fetchImpl(`${origin}/api/present-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
        body: JSON.stringify(body),
        signal,
    });
    const payload = await readJson(response) as Record<string, unknown>;
    if (!response.ok) {
        throw new PresentApiError(response.status, String(payload?.error ?? `present-command POST failed (${response.status})`));
    }
    const command = payload?.command;
    if (!command || typeof command !== 'object') {
        throw new PresentApiError(502, 'malformed_command');
    }
    return payload as { command: PresentCommand } & Record<string, unknown>;
}

export function isCommandAcked(status: PresentStatusPayload, commandId: string): boolean {
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
    options?: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal },
): Promise<AckWaitResult> {
    const intervalMs = options?.intervalMs ?? ACK_POLL_INTERVAL_MS;
    const maxAttempts = options?.maxAttempts ?? ACK_MAX_ATTEMPTS;
    let attempts = 0;
    let lastStatus = await fetchPresentStatus(origin, fetchImpl, options?.signal);
    while (attempts < maxAttempts) {
        if (isCommandAcked(lastStatus, commandId)) {
            return { acknowledged: true, attempts: attempts + 1, status: lastStatus };
        }
        attempts += 1;
        if (attempts >= maxAttempts) break;
        await sleep(intervalMs, options?.signal);
        lastStatus = await fetchPresentStatus(origin, fetchImpl, options?.signal);
    }
    return { acknowledged: false, attempts, status: lastStatus };
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
