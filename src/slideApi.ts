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

async function postSlide(slide: PresentSlide): Promise<void> {
    const res = await fetch('/api/present-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode: slide.mode, content: slide.content }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const error = new Error(err.error || `Save failed (${res.status})`);
        (error as any).status = res.status;
        throw error;
    }
}

export async function saveRemoteSlide(slide: PresentSlide): Promise<void> {
    let lastError: any;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            await postSlide(slide);
            return;
        } catch (e: any) {
            lastError = e;
            // Don't retry client errors (4xx) — they won't succeed on retry
            if (e?.status && e.status >= 400 && e.status < 500) throw e;
            if (attempt < RETRY_DELAYS_MS.length) {
                await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
            }
        }
    }
    throw lastError;
}
