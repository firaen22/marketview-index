import { describe, expect, it } from 'vitest';
import type { GlossaryTermSnapshot } from '../lib/glossarySession';
import {
    GLOSSARY_SAVED_KEY,
    MAX_SAVED_CODES,
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

describe('glossary saved eviction order (sweep 19)', () => {
    it('does not sacrifice a recently saved all-digit code for older string codes', () => {
        const storage = memoryStorage();
        // Oldest first: one string code, then the all-digit code, then fill up.
        setTermSaved('OLDEST22', term('a'), true, storage);
        setTermSaved('23456789', term('b'), true, storage);
        for (let i = 0; i < MAX_SAVED_CODES - 2; i += 1) {
            setTermSaved(`FILL2${String(i).padStart(3, '0')}`.slice(0, 8), term(`f${i}`), true, storage);
        }
        // Store is now at the cap; the next new code must evict OLDEST22 —
        // pre-fix, Object.keys listed "23456789" first and evicted it instead.
        setTermSaved('NEWEST22', term('n'), true, storage);

        const sessions = readSavedStore(storage).sessions;
        expect(Object.keys(sessions)).toHaveLength(MAX_SAVED_CODES);
        expect(sessions['23456789']).toBeDefined();
        expect(sessions['OLDEST22']).toBeUndefined();
        expect(sessions['NEWEST22']).toBeDefined();
    });

    it('re-saving moves an all-digit code to the back of the eviction queue', () => {
        const storage = memoryStorage();
        setTermSaved('23456789', term('a'), true, storage);
        for (let i = 0; i < MAX_SAVED_CODES - 1; i += 1) {
            setTermSaved(`FILL2${String(i).padStart(3, '0')}`.slice(0, 8), term(`f${i}`), true, storage);
        }
        // Touch the all-digit code, then push one past the cap: FILL2000 is
        // now the least recently saved and must be the one evicted.
        setTermSaved('23456789', term('a2'), true, storage);
        setTermSaved('NEWEST22', term('n'), true, storage);

        const sessions = readSavedStore(storage).sessions;
        expect(sessions['23456789']).toBeDefined();
        expect(sessions['FILL2000']).toBeUndefined();
    });

    it('rebuilds a usable order for legacy stores without the field', () => {
        const storage = memoryStorage();
        storage.setItem(GLOSSARY_SAVED_KEY, JSON.stringify({
            v: 1,
            sessions: { AAAA2222: [term('a')], '23456789': [term('b')] },
        }));
        const store = readSavedStore(storage);
        expect([...store.order].sort()).toEqual(['23456789', 'AAAA2222']);
        // A save still works and stays within the schema.
        const result = setTermSaved('AAAA2222', term('c'), true, storage);
        expect(result.enabled).toBe(true);
        expect(readSavedStore(storage).order).toContain('AAAA2222');
    });

    it('drops malformed and orphaned entries from a stored order field', () => {
        const storage = memoryStorage();
        storage.setItem(GLOSSARY_SAVED_KEY, JSON.stringify({
            v: 1,
            sessions: { AAAA2222: [term('a')] },
            order: ['GONE2222', 42, 'AAAA2222', 'AAAA2222'],
        }));
        expect(readSavedStore(storage).order).toEqual(['AAAA2222']);
    });
});
