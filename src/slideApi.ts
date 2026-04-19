import type { PresentSlide } from './settings';

export async function loadRemoteSlide(): Promise<PresentSlide | null> {
    try {
        const res = await fetch('/api/present-slide');
        if (!res.ok) return null;
        const json = await res.json();
        if (json?.slide) return typeof json.slide === 'string' ? JSON.parse(json.slide) : json.slide;
    } catch {}
    return null;
}

export async function uploadPdf(file: File): Promise<string> {
    const res = await fetch('/api/present-pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/pdf',
            'x-filename': encodeURIComponent(file.name),
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

export async function saveRemoteSlide(slide: PresentSlide): Promise<void> {
    const res = await fetch('/api/present-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: slide.mode, content: slide.content }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Save failed (${res.status})`);
    }
}
