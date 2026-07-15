import type { CatalogItem, PresentCommand } from '../lib/presentCommand';
import { isExecutablePresentCommand } from '../lib/presentCommand';

const API_KEY = import.meta.env.VITE_PRESENT_API_KEY;

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
