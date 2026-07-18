import { fetchProjectorState, authHeaders } from './presentCommandApi';
import { isValidPresentSlide } from './slideApi';
import { getSettings, type PresentSlide } from './settings';

export type PreflightStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface PreflightResult {
    id: string;
    status: PreflightStatus;
    detail: string;
}

type Classification = Pick<PreflightResult, 'status' | 'detail'>;

const LIVE_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const JARGON_TIMEOUT_MS = 45_000;

export const PREFLIGHT_PROBE_TEXT = 'The fund duration is 4.2 years with 50 basis points of spread over the benchmark EBITDA margin.';

function is2xx(status: number) {
    return Number.isFinite(status) && status >= 200 && status < 300;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function result(id: string, classification: Classification): PreflightResult {
    return { id, ...classification };
}

export function classifySlide(status: number, payload: unknown): Classification {
    if (!is2xx(status)) return { status: 'fail', detail: `HTTP ${status}` };
    try {
        const slide = asRecord(payload)?.slide;
        if (isValidPresentSlide(slide)) return { status: 'pass', detail: `mode ${slide.mode}` };
    } catch {}
    return { status: 'fail', detail: 'invalid slide shape' };
}

export function classifyDeck(slideMode: string, deckStatus: number | null, contentType: string | null): Classification {
    if (slideMode !== 'pdf') return { status: 'skip', detail: 'no PDF deck' };
    if (deckStatus === null) return { status: 'fail', detail: 'unreachable/timeout' };
    if (!is2xx(deckStatus)) return { status: 'fail', detail: `HTTP ${deckStatus}` };

    const trimmedType = typeof contentType === 'string' ? contentType.trim() : '';
    if (trimmedType && !trimmedType.toLowerCase().includes('pdf')) {
        return { status: 'warn', detail: `unexpected content-type ${trimmedType}` };
    }
    return { status: 'pass', detail: trimmedType ? `HTTP ${deckStatus} ${trimmedType}` : `HTTP ${deckStatus}` };
}

export function classifyMarket(status: number, payload: unknown): Classification {
    if (!is2xx(status)) return { status: 'fail', detail: `HTTP ${status}` };
    try {
        const body = asRecord(payload);
        if (body?.success !== true) return { status: 'fail', detail: 'success false' };
        if (!Array.isArray(body.data)) return { status: 'fail', detail: 'malformed response' };
        if (body.source === 'server_stale_cache') return { status: 'warn', detail: 'serving stale cache' };
        if (body.data.length === 0) return { status: 'warn', detail: '0 items' };
        return { status: 'pass', detail: `${body.data.length} items` };
    } catch {
        return { status: 'fail', detail: 'malformed response' };
    }
}

export function classifyMacro(status: number, payload: unknown): Classification {
    if (!is2xx(status)) return { status: 'fail', detail: `HTTP ${status}` };
    try {
        const body = asRecord(payload);
        if (body?.success !== true) return { status: 'fail', detail: 'success false' };
        if (!Array.isArray(body.data)) return { status: 'fail', detail: 'malformed response' };
        if (body.data.length === 0) return { status: 'warn', detail: '0 items' };
        return { status: 'pass', detail: `${body.data.length} items` };
    } catch {
        return { status: 'fail', detail: 'malformed response' };
    }
}

export function classifyProjector(projector: { at: number } | null, serverTime: number): Classification {
    if (!projector) return { status: 'warn', detail: 'not reporting - open /present' };
    const at = projector.at;
    if (!Number.isFinite(at) || !Number.isFinite(serverTime)) {
        return { status: 'warn', detail: 'invalid report time' };
    }
    const elapsedMs = Math.max(0, serverTime - at);
    if (elapsedMs <= LIVE_MS) return { status: 'pass', detail: 'live' };
    return { status: 'warn', detail: `last report ${Math.floor(elapsedMs / 1000)}s ago` };
}

export function classifyAuth(status: number): Classification {
    if (status === 400) return { status: 'pass', detail: 'write key accepted' };
    if (status === 401) return { status: 'fail', detail: 'write key rejected or missing' };
    if (status === 429) return { status: 'warn', detail: 'rate limited' };
    return { status: 'warn', detail: `HTTP ${status}` };
}

export function classifyJargon(status: number, payload: unknown): Classification {
    if (status === 503) return { status: 'fail', detail: 'no AI key configured' };
    if (status === 502) return { status: 'fail', detail: 'AI processing failed' };
    if (status !== 200) return { status: 'fail', detail: `HTTP ${status}` };
    try {
        const body = asRecord(payload);
        if (body?.success === true && Array.isArray(body.terms)) {
            return { status: 'pass', detail: body.source === 'cache' ? 'cached' : 'fresh' };
        }
    } catch {}
    return { status: 'fail', detail: 'malformed success' };
}

function isValidPdfProxyPath(value: string): boolean {
    if (!value.startsWith('/api/pdf-proxy?')) return false;
    try {
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin
            && url.pathname === '/api/pdf-proxy'
            && (url.searchParams.get('key') ?? '').trim().length > 0;
    } catch {
        return false;
    }
}

interface FetchStatusJson {
    status: number;
    payload: unknown;
}

interface FetchStatusHeaders {
    status: number;
    contentType: string | null;
}

function makeAbortError() {
    return new DOMException('Aborted', 'AbortError');
}

export function runPreflight(opts: { lang: 'en' | 'zh-TW' }): { results: Promise<PreflightResult>[]; abort: () => void } {
    const controllers = new Set<AbortController>();
    const settings = getSettings();

    const createController = (timeoutMs: number) => {
        const controller = new AbortController();
        controllers.add(controller);
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        const cleanup = () => {
            window.clearTimeout(timeoutId);
            controllers.delete(controller);
        };
        return { controller, cleanup };
    };

    const fetchJson = async (url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchStatusJson | null> => {
        const { controller, cleanup } = createController(timeoutMs);
        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            const payload = await response.json().catch(() => undefined);
            return { status: response.status, payload };
        } catch {
            return null;
        } finally {
            cleanup();
        }
    };

    const fetchHeadersOnly = async (url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchStatusHeaders | null> => {
        const { controller, cleanup } = createController(timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            const headers = {
                status: response.status,
                contentType: response.headers.get('Content-Type'),
            };
            controller.abort();
            return headers;
        } catch {
            return null;
        } finally {
            cleanup();
        }
    };

    const slideFetch = (async (): Promise<{ row: PreflightResult; slide: PresentSlide | null }> => {
        const fetched = await fetchJson('/api/present-slide');
        if (!fetched) return { row: result('slide', { status: 'fail', detail: 'unreachable/timeout' }), slide: null };
        const classification = classifySlide(fetched.status, fetched.payload);
        const rawSlide = asRecord(fetched.payload)?.slide;
        const slide = classification.status === 'pass' && isValidPresentSlide(rawSlide) ? rawSlide : null;
        return { row: result('slide', classification), slide };
    })();

    const slideResult = slideFetch.then(({ row }) => row).catch(() => result('slide', { status: 'fail', detail: 'unreachable/timeout' }));

    const deckResult = slideFetch.then(async ({ slide }) => {
        if (!slide) return result('deck', { status: 'fail', detail: 'slide unavailable' });
        if (slide.mode !== 'pdf') return result('deck', classifyDeck(slide.mode, null, null));
        if (!isValidPdfProxyPath(slide.content)) return result('deck', { status: 'fail', detail: 'invalid PDF URL' });
        const fetched = await fetchHeadersOnly(slide.content);
        if (!fetched) return result('deck', classifyDeck('pdf', null, null));
        return result('deck', classifyDeck('pdf', fetched.status, fetched.contentType));
    }).catch(() => result('deck', { status: 'fail', detail: 'slide unavailable' }));

    const marketResult = fetchJson(`/api/market-data?range=YTD&lang=${encodeURIComponent(opts.lang)}`)
        .then(fetched => result('market', fetched ? classifyMarket(fetched.status, fetched.payload) : { status: 'fail', detail: 'unreachable/timeout' }))
        .catch(() => result('market', { status: 'fail', detail: 'unreachable/timeout' }));

    const macroResult = fetchJson(`/api/macro-data?lang=${encodeURIComponent(opts.lang)}`)
        .then(fetched => result('macro', fetched ? classifyMacro(fetched.status, fetched.payload) : { status: 'fail', detail: 'unreachable/timeout' }))
        .catch(() => result('macro', { status: 'fail', detail: 'unreachable/timeout' }));

    const projectorResult = (async () => {
        const { controller, cleanup } = createController(DEFAULT_TIMEOUT_MS);
        try {
            const state = await fetchProjectorState(controller.signal);
            return result('projector', classifyProjector(state.projector, state.serverTime));
        } catch {
            return result('projector', { status: 'fail', detail: 'unreachable/timeout' });
        } finally {
            cleanup();
        }
    })();

    const authResult = fetchJson('/api/present-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'preflight' }),
    }).then(fetched => result('auth', fetched ? classifyAuth(fetched.status) : { status: 'fail', detail: 'unreachable/timeout' }))
        .catch(() => result('auth', { status: 'fail', detail: 'unreachable/timeout' }));

    const jargonResult = (async () => {
        if (settings.jargonEnabled === false) return result('jargon', { status: 'skip', detail: 'jargon disabled' });
        const key = settings.geminiKey.trim();
        const fetched = await fetchJson('/api/explain-jargon', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify({ text: PREFLIGHT_PROBE_TEXT, lang: opts.lang }),
        }, JARGON_TIMEOUT_MS);
        return result('jargon', fetched ? classifyJargon(fetched.status, fetched.payload) : { status: 'fail', detail: 'unreachable/timeout' });
    })().catch(() => result('jargon', { status: 'fail', detail: 'unreachable/timeout' }));

    return {
        results: [slideResult, deckResult, marketResult, macroResult, projectorResult, authResult, jargonResult],
        abort: () => {
            for (const controller of controllers) {
                if (!controller.signal.aborted) controller.abort(makeAbortError());
            }
            controllers.clear();
        },
    };
}
