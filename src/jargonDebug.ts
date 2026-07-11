// Diagnostic beacon for the jargon pipeline, active only when the page URL
// contains ?jargonDebug=1. Each stage event is POSTed fire-and-forget to
// /api/jargon-debug, which logs it to Vercel runtime logs — lets us see where
// the pipeline dies on devices we can't attach an inspector to (iPad/iPhone).
let cachedEnabled: boolean | null = null;
let sentUa = false;

export function jargonDebugEnabled(): boolean {
    if (cachedEnabled === null) {
        try {
            cachedEnabled = new URLSearchParams(window.location.search).get('jargonDebug') === '1';
        } catch {
            cachedEnabled = false;
        }
    }
    return cachedEnabled;
}

export function jargonDebug(stage: string, data?: Record<string, unknown>): void {
    if (!jargonDebugEnabled()) return;
    try {
        const payload: Record<string, unknown> = { stage, ...data };
        if (!sentUa) {
            sentUa = true;
            payload.ua = navigator.userAgent;
        }
        fetch('/api/jargon-debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {});
    } catch {}
}
