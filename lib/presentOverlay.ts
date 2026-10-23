// Image/SVG popup that sits on the current PDF deck. It is a present-command,
// not a slide mode: posting it must not replace slide-state.

const MAX_IMAGE_SRC_CHARS = 512_000;
const MAX_HTTPS_SRC_CHARS = 2_048;
const MAX_CAPTION_CHARS = 160;

export interface PresentImageOverlay {
    type: 'image';
    src: string;
    caption?: string;
}

export interface PresentOverlayClear {
    type: 'clear';
}

export type PresentOverlayPayload = PresentImageOverlay | PresentOverlayClear;

export function isOverlayImageSrc(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    if (value.length < 1 || value.length > MAX_IMAGE_SRC_CHARS) return false;
    if (/\s/.test(value)) return false;
    if (value.startsWith('https://')) {
        if (value.length > MAX_HTTPS_SRC_CHARS) return false;
        try {
            return new URL(value).protocol === 'https:';
        } catch {
            return false;
        }
    }
    // <img> only. SVG-as-image does not run script; do not inline the markup.
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    return match[2].length % 4 === 0;
}

export function isOverlayCaption(value: unknown): value is string {
    return typeof value === 'string'
        && value.length >= 1
        && value.length <= MAX_CAPTION_CHARS
        && !/[\u0000-\u001f]/.test(value);
}

export function isPresentOverlayPayload(value: unknown): value is PresentOverlayPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const raw = value as Record<string, unknown>;
    const keys = Object.keys(raw);
    if (raw.type === 'clear') return keys.length === 1;
    if (raw.type !== 'image') return false;
    if (!keys.every(key => key === 'type' || key === 'src' || key === 'caption')) return false;
    if (!isOverlayImageSrc(raw.src)) return false;
    if (raw.caption !== undefined && !isOverlayCaption(raw.caption)) return false;
    return true;
}
