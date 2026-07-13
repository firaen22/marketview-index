import { describe, expect, it } from 'vitest';
import type { GlossaryTermSnapshot } from '../lib/glossarySession';
import {
    GLOSSARY_SAVED_KEY,
    MAX_SAVED_CODES,
    MAX_SAVED_TERMS_PER_CODE,
    getSavedTerms,
    isTermSaved,
    readSavedStore,
    setTermSaved,
} from './glossarySaved';

function term(id: string): GlossaryTermSnapshot {
    return {
        id,
        term: `Term ${id}`,
        explanation: { en: `Explanation ${id}` },
        firstPage: 1,
        unlockedAt: 100,
    };
}

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: key => data.get(key) ?? null,
        key: index => Array.from(data.keys())[index] ?? null,
        removeItem: key => data.delete(key),
        setItem: (key, value) => {
            data.set(key, value);
        },
    };
}

describe('glossary saved storage', () => {
    it('treats missing, corrupt, and unknown-version storage as empty', () => {
        const storage = memoryStorage();

        expect(readSavedStore(storage)).toEqual({ v: 1, sessions: {} });
        storage.setItem(GLOSSARY_SAVED_KEY, '{');
        expect(readSavedStore(storage)).toEqual({ v: 1, sessions: {} });
        storage.setItem(GLOSSARY_SAVED_KEY, JSON.stringify({ v: 2, sessions: { ABCD2345: [term('a')] } }));
        expect(readSavedStore(storage)).toEqual({ v: 1, sessions: {} });
    });

    it('saves full snapshots and removes them on a second toggle', () => {
        const storage = memoryStorage();
        const snapshot = term('duration');

        expect(setTermSaved('ABCD2345', snapshot, true, storage)).toMatchObject({
            saved: true,
            terms: [snapshot],
            enabled: true,
        });
        expect(isTermSaved('ABCD2345', 'duration', storage)).toBe(true);
        expect(getSavedTerms('ABCD2345', storage)[0]).toEqual(snapshot);

        expect(setTermSaved('ABCD2345', snapshot, false, storage)).toMatchObject({
            saved: false,
            terms: [],
            enabled: true,
        });
        expect(isTermSaved('ABCD2345', 'duration', storage)).toBe(false);
    });

    it('caps terms per code and evicts the oldest code after 20 codes', () => {
        const storage = memoryStorage();
        for (let i = 0; i < MAX_SAVED_TERMS_PER_CODE + 5; i += 1) {
            setTermSaved('ABCD2345', term(`term-${i}`), true, storage);
        }
        expect(getSavedTerms('ABCD2345', storage)).toHaveLength(MAX_SAVED_TERMS_PER_CODE);

        for (let i = 0; i < MAX_SAVED_CODES + 1; i += 1) {
            setTermSaved(`CODE000${i}`, term(`code-${i}`), true, storage);
        }
        const sessions = readSavedStore(storage).sessions;
        expect(Object.keys(sessions)).toHaveLength(MAX_SAVED_CODES);
        expect(sessions.ABCD2345).toBeUndefined();
    });

    it('silently disables saving when storage throws', () => {
        const throwingStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error('quota');
            },
        } as unknown as Storage;

        expect(setTermSaved('ABCD2345', term('a'), true, throwingStorage)).toEqual({
            saved: false,
            terms: [],
            enabled: false,
        });
        expect(getSavedTerms('ABCD2345', throwingStorage)).toEqual([]);
    });
});
