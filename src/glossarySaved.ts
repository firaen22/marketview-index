import type { GlossaryTermSnapshot } from '../lib/glossarySession';

export const GLOSSARY_SAVED_KEY = 'marketflow_glossary_saved_v1';
export const MAX_SAVED_TERMS_PER_CODE = 200;
export const MAX_SAVED_CODES = 20;

interface SavedStore {
    v: 1;
    sessions: Record<string, GlossaryTermSnapshot[]>;
    // Explicit LRU order (oldest first). Object key order cannot carry this:
    // an all-digit join code ("23456789") is an integer-like key, which
    // Object.keys lists first regardless of insertion order — so age-based
    // eviction over the keys would always sacrifice such a code first.
    order: string[];
}

function emptyStore(): SavedStore {
    return { v: 1, sessions: {}, order: [] };
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
        // Rebuild the LRU order: keep the stored order where valid (dropping
        // duplicates and codes with no entry), then append any codes it does
        // not cover (legacy stores predate the field).
        const rawOrder = (store as { order?: unknown }).order;
        const seen = new Set<string>();
        const order: string[] = [];
        for (const code of Array.isArray(rawOrder) ? rawOrder : []) {
            if (typeof code !== 'string' || seen.has(code)) continue;
            if (!Object.prototype.hasOwnProperty.call(sessions, code)) continue;
            seen.add(code);
            order.push(code);
        }
        for (const code of Object.keys(sessions)) {
            if (seen.has(code)) continue;
            seen.add(code);
            order.push(code);
        }
        return { v: 1, sessions, order };
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

// Rewrite a code's entry and move it to the back of the LRU order (or drop it
// entirely when its term list emptied). The order array — not object key
// order — is what eviction walks, so an all-digit code ages like any other.
function touchCode(store: SavedStore, code: string, terms: GlossaryTermSnapshot[]): void {
    delete store.sessions[code];
    store.order = store.order.filter(item => item !== code);
    if (terms.length > 0) {
        store.sessions[code] = terms;
        store.order.push(code);
    }
}

// Evict least-recently-saved codes first. Never evict the code we just wrote —
// silently losing the save while the caller still reports success.
function evictOldestCodes(store: SavedStore, keep: string): void {
    const evictable = store.order.filter(code => code !== keep);
    while (Object.keys(store.sessions).length > MAX_SAVED_CODES) {
        const oldest = evictable.shift();
        if (!oldest) break;
        delete store.sessions[oldest];
        store.order = store.order.filter(code => code !== oldest);
    }
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

    touchCode(store, code, nextTerms);
    evictOldestCodes(store, code);

    const enabled = writeSavedStore(store, storage);
    return {
        saved: shouldSave && enabled,
        terms: enabled ? nextTerms : current,
        enabled,
    };
}

export function saveAllTerms(
    code: string,
    terms: GlossaryTermSnapshot[],
    storage?: Storage | null,
): { terms: GlossaryTermSnapshot[]; enabled: boolean } {
    const store = readSavedStore(storage);
    const current = store.sessions[code] ?? [];
    if (terms.length === 0) return { terms: current, enabled: true };

    const existingIds = new Set(current.map(term => term.id));
    const newTerms: GlossaryTermSnapshot[] = [];
    const addedIds = new Set<string>();
    for (const term of terms) {
        if (existingIds.has(term.id) || addedIds.has(term.id)) continue;
        addedIds.add(term.id);
        newTerms.push(term);
    }
    const nextTerms = [...newTerms, ...current].slice(0, MAX_SAVED_TERMS_PER_CODE);

    touchCode(store, code, nextTerms);
    evictOldestCodes(store, code);

    const enabled = writeSavedStore(store, storage);
    return { terms: enabled ? nextTerms : current, enabled };
}
