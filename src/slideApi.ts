import type { PresentSlide } from './settings';

const API_KEY = (import.meta as any).env?.VITE_PRESENT_API_KEY as string | undefined;

function authHeaders(): Record<string, string> {
    return API_KEY ? { 'x-api-key': API_KEY } : {};
}

export async function loadRemoteSlide(): Promise<PresentSlide | null> {
    try {
        const res = await fetch('/api/present-slide');
        if (!res.ok) return null;
        const json = await res.json();
        if (json?.slide) return typeof json.slide === 'string' ? JSON.parse(json.slide) : json.slide;
    } catch {}
    return null;
}

export async function deletePdf(url: string): Promise<void> {
    if (!url || !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) return;
    try {
        await fetch('/api/present-pdf', {
            method: 'DELETE',
            headers: { 'x-blob-url': url, ...authHeaders() },
        });
    } catch {
        // Best-effort cleanup — don't block UX on failure
    }
}

export async function uploadPdf(file: File): Promise<string> {
    const res = await fetch('/api/present-pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/pdf',
            'x-filename': encodeURIComponent(file.name),
            ...authHeaders(),
        },
        body: file,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Upload failed');
    }
    const json = await res.json();
    return json.url as string;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

// Only one save may be in flight at a time. When a newer save arrives, the
// older one (including any pending retry sleep) is aborted so stale content
// can never overwrite newer content.
let currentSaveController: AbortController | null = null;

async function postSlide(slide: PresentSlide, signal: AbortSignal): Promise<void> {
    const res = await fetch('/api/present-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode: slide.mode, content: slide.content }),
        signal,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const error = new Error(err.error || `Save failed (${res.status})`);
        (error as any).status = res.status;
        throw error;
    }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const id = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(id);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export class StaleSaveError extends Error {
    constructor() { super('Superseded by newer save'); this.name = 'StaleSaveError'; }
}

export async function saveRemoteSlide(slide: PresentSlide): Promise<void> {
    // Cancel any in-flight save — the caller's newer content supersedes it.
    if (currentSaveController) currentSaveController.abort();
    const controller = new AbortController();
    currentSaveController = controller;
    const { signal } = controller;

    let lastError: any;
    try {
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
            if (signal.aborted) throw new StaleSaveError();
            try {
                await postSlide(slide, signal);
                return;
            } catch (e: any) {
                if (e?.name === 'AbortError' || signal.aborted) throw new StaleSaveError();
                lastError = e;
                // Don't retry client errors (4xx) — they won't succeed on retry
                if (e?.status && e.status >= 400 && e.status < 500) throw e;
                if (attempt < RETRY_DELAYS_MS.length) {
                    try {
                        await sleep(RETRY_DELAYS_MS[attempt], signal);
                    } catch {
                        throw new StaleSaveError();
                    }
                }
            }
        }
        throw lastError;
    } finally {
        // Clear the module-level ref only if this save is still the current one
        if (currentSaveController === controller) currentSaveController = null;
    }
}
