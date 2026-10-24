import type { PublicGlossarySession } from './glossaryApi';

export const AUDIENCE_GLOSSARY_POLL_MS = 8000;
export const AUDIENCE_GLOSSARY_SLOW_POLL_MS = 15_000;
export const AUDIENCE_GLOSSARY_SLOW_AFTER_MISSES = 5;

const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

export type AudienceGlossarySnapshot =
    | { kind: 'none' }
    | { kind: 'live' | 'ended'; code: string; session: Pick<PublicGlossarySession, 'status' | 'mode' | 'currentPage' | 'termCount' | 'joins' | 'updatedAt'> };

export function parseCurrentGlossaryPointer(body: unknown): string | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const code = typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code.trim().toUpperCase()
        : '';
    return JOIN_CODE_PATTERN.test(code) ? code : null;
}

export function toAudienceGlossarySnapshot(code: string, session: PublicGlossarySession): AudienceGlossarySnapshot {
    return {
        kind: session.status,
        code,
        session: {
            status: session.status,
            mode: session.mode,
            currentPage: session.currentPage,
            termCount: session.termCount,
            joins: session.joins,
            updatedAt: session.updatedAt,
        },
    };
}

export function audienceGlossaryPollDelayMs(consecutiveMisses: number): number {
    return consecutiveMisses >= AUDIENCE_GLOSSARY_SLOW_AFTER_MISSES
        ? AUDIENCE_GLOSSARY_SLOW_POLL_MS
        : AUDIENCE_GLOSSARY_POLL_MS;
}
