import type { GlossaryTermSnapshot } from '../lib/glossarySession';

export const GLOSSARY_SAVED_KEY = 'marketflow_glossary_saved_v1';
export const MAX_SAVED_TERMS_PER_CODE = 200;
export const MAX_SAVED_CODES = 20;

interface SavedStore {
    v: 1;
    sessions: Record<string, GlossaryTermSnapshot[]>;
}

function emptyStore(): SavedStore {
    return { v: 1, sessions: {} };
}

function getStorage(storage?: Storage | null): Storage | null {
    if (storage !== undefined) return storage;
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function isTermSnapshot(value: unknown): value is GlossaryTermSnapshot {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<GlossaryTermSnapshot>;
    return (
        typeof item.id === 'string'
        && typeof item.term === 'string'
        && !!item.explanation
        && typeof item.explanation === 'object'
        && (typeof item.explanation.en === 'string' || typeof item.explanation['zh-TW'] === 'string')
        && typeof item.firstPage === 'number'
        && Number.isFinite(item.firstPage)
        && typeof item.unlockedAt === 'number'
        && Number.isFinite(item.unlockedAt)
    );
}

export function readSavedStore(storage?: Storage | null): SavedStore {
    const target = getStorage(storage);
    if (!target) return emptyStore();

    try {
        const raw = target.getItem(GLOSSARY_SAVED_KEY);
        if (!raw) return emptyStore();
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return emptyStore();
        const store = parsed as Partial<SavedStore>;
        if (store.v !== 1 || !store.sessions || typeof store.sessions !== 'object') return emptyStore();

        const sessions: SavedStore['sessions'] = {};
        for (const [code, terms] of Object.entries(store.sessions)) {
            if (!Array.isArray(terms)) continue;
            sessions[code] = terms.filter(isTermSnapshot).slice(0, MAX_SAVED_TERMS_PER_CODE);
        }
        return { v: 1, sessions };
    } catch {
        return emptyStore();
    }
}

export function writeSavedStore(store: SavedStore, storage?: Storage | null): boolean {
    const target = getStorage(storage);
    if (!target) return false;

    try {
        target.setItem(GLOSSARY_SAVED_KEY, JSON.stringify(store));
        return true;
    } catch {
        return false;
    }
}

export function getSavedTerms(code: string, storage?: Storage | null): GlossaryTermSnapshot[] {
    return readSavedStore(storage).sessions[code] ?? [];
}

export function isTermSaved(code: string, termId: string, storage?: Storage | null): boolean {
    return getSavedTerms(code, storage).some(term => term.id === termId);
}

export function setTermSaved(
    code: string,
    term: GlossaryTermSnapshot,
    shouldSave: boolean,
    storage?: Storage | null,
): { saved: boolean; terms: GlossaryTermSnapshot[]; enabled: boolean } {
    const store = readSavedStore(storage);
    const current = store.sessions[code] ?? [];
    const withoutTerm = current.filter(item => item.id !== term.id);
    const nextTerms = shouldSave
        ? [term, ...withoutTerm].slice(0, MAX_SAVED_TERMS_PER_CODE)
        : withoutTerm;

    delete store.sessions[code];
    if (nextTerms.length > 0) {
        store.sessions[code] = nextTerms;
    }

    const codes = Object.keys(store.sessions);
    while (codes.length > MAX_SAVED_CODES) {
        const oldest = codes.shift();
        if (oldest) delete store.sessions[oldest];
    }

    const enabled = writeSavedStore(store, storage);
    return {
        saved: shouldSave && enabled,
        terms: enabled ? nextTerms : current,
        enabled,
    };
}
