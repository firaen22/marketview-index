export const PROJECTOR_DISPLAY_SCHEMA = 1;
export const DISPLAY_DIM_MIN = 0;
export const DISPLAY_DIM_MAX = 7680;
export const DISPLAY_DPR_MIN = 0.5;
export const DISPLAY_DPR_MAX = 4;
const LANG_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;

export interface ProjectorDisplay {
    schema: 1;
    iw: number;
    ih: number;
    dpr: number;
    fw?: number;
    fh?: number;
    screenW?: number;
    screenH?: number;
    lang?: string;
}

function validDim(value: unknown, allowZero = false): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    if (allowZero && value === 0) return 0;
    if (value < 1 || value > DISPLAY_DIM_MAX) return null;
    return value;
}

function validDpr(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value * 100) / 100;
    if (rounded < DISPLAY_DPR_MIN || rounded > DISPLAY_DPR_MAX) return null;
    return rounded;
}

function validLang(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || value.length > 16 || !LANG_PATTERN.test(value)) return undefined;
    return value;
}

export function validateProjectorDisplay(value: unknown): ProjectorDisplay | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (raw.schema !== PROJECTOR_DISPLAY_SCHEMA) return null;
    const iw = validDim(raw.iw);
    const ih = validDim(raw.ih);
    const dpr = validDpr(raw.dpr);
    if (iw === null || ih === null || dpr === null) return null;

    const fw = raw.fw === undefined ? undefined : validDim(raw.fw);
    const fh = raw.fh === undefined ? undefined : validDim(raw.fh);
    if (raw.fw !== undefined && fw === null) return null;
    if (raw.fh !== undefined && fh === null) return null;

    const screenW = raw.screenW === undefined ? undefined : validDim(raw.screenW);
    const screenH = raw.screenH === undefined ? undefined : validDim(raw.screenH);
    if (raw.screenW !== undefined && screenW === null) return null;
    if (raw.screenH !== undefined && screenH === null) return null;

    const lang = validLang(raw.lang);
    if (raw.lang !== undefined && lang === undefined) return null;

    return {
        schema: 1,
        iw,
        ih,
        dpr,
        ...(fw !== undefined ? { fw } : {}),
        ...(fh !== undefined ? { fh } : {}),
        ...(screenW !== undefined ? { screenW } : {}),
        ...(screenH !== undefined ? { screenH } : {}),
        ...(lang !== undefined ? { lang } : {}),
    };
}

function oneQuery(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
}

function parseStrictInteger(value: unknown, min: number, max: number): number | null {
    const text = oneQuery(value);
    if (text === null || !/^(0|[1-9]\d*)$/.test(text)) return null;
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
    return parsed;
}

/** dpr on the wire: integer hundredths (125 → 1.25). */
function parseDprQuery(value: unknown): number | null {
    const cents = parseStrictInteger(value, 50, 400);
    if (cents === null) return null;
    return validDpr(cents / 100);
}

export function parseProjectorDisplayFromQuery(query: Record<string, unknown>): ProjectorDisplay | null {
    const iw = parseStrictInteger(query.iw, 1, DISPLAY_DIM_MAX);
    const ih = parseStrictInteger(query.ih, 1, DISPLAY_DIM_MAX);
    const dpr = parseDprQuery(query.dpr);
    if (iw === null || ih === null || dpr === null) return null;

    const raw: Record<string, unknown> = { schema: PROJECTOR_DISPLAY_SCHEMA, iw, ih, dpr };
    const fw = parseStrictInteger(query.fw, 1, DISPLAY_DIM_MAX);
    const fh = parseStrictInteger(query.fh, 1, DISPLAY_DIM_MAX);
    if (fw !== null) raw.fw = fw;
    if (fh !== null) raw.fh = fh;
    const screenW = parseStrictInteger(query.sw, 1, DISPLAY_DIM_MAX);
    const screenH = parseStrictInteger(query.sh, 1, DISPLAY_DIM_MAX);
    if (screenW !== null) raw.screenW = screenW;
    if (screenH !== null) raw.screenH = screenH;
    const langText = oneQuery(query.dlang);
    if (langText !== null) {
        const lang = validLang(langText);
        if (lang !== undefined) raw.lang = lang;
    }

    return validateProjectorDisplay(raw);
}

export interface ControlSurfaceState {
    at: number;
    display: ProjectorDisplay;
}

export function controlDisplayReportUrl(display: ProjectorDisplay): string {
    const params = new URLSearchParams();
    params.set('st', '1');
    params.set('role', 'control');
    appendProjectorDisplayParams(params, display);
    return `/api/present-command?${params.toString()}`;
}

export function appendProjectorDisplayParams(params: URLSearchParams, display: ProjectorDisplay | undefined): void {
    if (!display) return;
    params.set('iw', String(display.iw));
    params.set('ih', String(display.ih));
    params.set('dpr', String(Math.round(display.dpr * 100)));
    if (display.fw !== undefined) params.set('fw', String(display.fw));
    if (display.fh !== undefined) params.set('fh', String(display.fh));
    if (display.screenW !== undefined) params.set('sw', String(display.screenW));
    if (display.screenH !== undefined) params.set('sh', String(display.screenH));
    if (display.lang !== undefined) params.set('dlang', display.lang);
}

export function sampleProjectorDisplay(opts: {
    lang?: string;
    indexIframe?: Pick<HTMLElement, 'clientWidth' | 'clientHeight'> | null;
}): ProjectorDisplay | undefined {
    if (typeof window === 'undefined') return undefined;
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const dpr = window.devicePixelRatio;
    let fw: number | undefined;
    let fh: number | undefined;
    if (opts.indexIframe) {
        const w = opts.indexIframe.clientWidth;
        const h = opts.indexIframe.clientHeight;
        if (w > 0 && h > 0) {
            fw = w;
            fh = h;
        }
    }
    const screenW = typeof window.screen?.width === 'number' ? validDim(window.screen.width) : null;
    const screenH = typeof window.screen?.height === 'number' ? validDim(window.screen.height) : null;
    const lang = opts.lang ? validLang(opts.lang) : undefined;
    return validateProjectorDisplay({
        schema: 1,
        iw,
        ih,
        dpr,
        ...(fw !== undefined && fh !== undefined ? { fw, fh } : {}),
        ...(screenW !== null ? { screenW } : {}),
        ...(screenH !== null ? { screenH } : {}),
        ...(lang !== undefined ? { lang } : {}),
    }) ?? undefined;
}
