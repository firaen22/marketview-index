import type { GlossaryLang, GlossarySession, GlossaryTermSnapshot } from '../lib/glossarySession';
import type { JargonTerm } from './jargon';

const API_KEY = import.meta.env.VITE_PRESENT_API_KEY;

if (import.meta.env.DEV && import.meta.env.MODE !== 'test' && !API_KEY) {
    console.warn('VITE_PRESENT_API_KEY not set — glossary session writes may fail');
}

function authHeaders(): Record<string, string> {
    return API_KEY ? { 'x-api-key': API_KEY } : {};
}

export interface PublicGlossarySession {
    status: 'live' | 'ended';
    mode: 'all' | 'gradual';
    currentPage: number;
    termCount: number;
    joins: number;
    updatedAt: number;
    terms: GlossaryTermSnapshot[];
}

export type ClientGlossarySession = (GlossarySession | PublicGlossarySession) & {
    joinCode: string;
    keepAfter?: boolean;
};

export class GlossaryApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'GlossaryApiError';
        this.status = status;
    }
}

async function readJson(response: Response): Promise<any> {
    return response.json().catch(() => ({}));
}

async function postGlossary(body: Record<string, unknown>): Promise<any> {
    const response = await fetch('/api/glossary-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new GlossaryApiError(response.status, payload?.error || `Glossary request failed (${response.status})`);
    }
    return payload;
}

export async function fetchGlossarySession(code: string): Promise<ClientGlossarySession | null> {
    const response = await fetch(`/api/glossary-session?code=${encodeURIComponent(code)}`);
    if (response.status === 404) return null;
    const payload = await readJson(response);
    if (!response.ok) {
        throw new GlossaryApiError(response.status, payload?.error || `Glossary session load failed (${response.status})`);
    }
    if (!payload?.session) return null;
    // The public view omits keepAfter — leave it undefined so callers know it
    // is unknown rather than assuming the server kept the session.
    return { ...payload.session, joinCode: code } as ClientGlossarySession;
}

export async function startGlossarySession(
    mode: GlossarySession['mode'],
    keepAfter: boolean,
    slideVersion = 0,
): Promise<ClientGlossarySession> {
    const payload = await postGlossary({ action: 'start', mode, keepAfter, slideVersion });
    return payload.session as ClientGlossarySession;
}

export async function pushGlossaryTerms(
    code: string,
    page: number,
    lang: GlossaryLang,
    terms: JargonTerm[],
): Promise<{ session: ClientGlossarySession; termLimitReached: boolean }> {
    const payload = await postGlossary({ action: 'push', code, page, lang, terms });
    return {
        session: payload.session as ClientGlossarySession,
        termLimitReached: payload.termLimitReached === true,
    };
}

export async function configGlossarySession(
    code: string,
    config: { mode?: GlossarySession['mode']; keepAfter?: boolean },
): Promise<ClientGlossarySession> {
    const payload = await postGlossary({ action: 'config', code, ...config });
    return payload.session as ClientGlossarySession;
}

export async function endGlossarySession(code: string): Promise<void> {
    await postGlossary({ action: 'end', code });
}

export async function reopenGlossarySession(code: string): Promise<ClientGlossarySession> {
    const payload = await postGlossary({ action: 'reopen', code });
    return payload.session as ClientGlossarySession;
}
