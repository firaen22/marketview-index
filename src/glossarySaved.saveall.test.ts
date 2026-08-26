import { describe, expect, it } from 'vitest';
import type { GlossaryTermSnapshot } from '../lib/glossarySession';
import {
    GLOSSARY_SAVED_KEY,
    MAX_SAVED_TERMS_PER_CODE,
    getSavedTerms,
    saveAllTerms,
    setTermSaved,
} from './glossarySaved';

function term(id: string): GlossaryTermSnapshot {
    return { id, term: `Term ${id}`, explanation: { en: `Explanation ${id}` }, firstPage: 1, unlockedAt: 100 };
}

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() { return data.size; },
        clear: () => data.clear(),
        getItem: key => data.get(key) ?? null,
        key: index => Array.from(data.keys())[index] ?? null,
        removeItem: key => data.delete(key),
        setItem: (key, value) => { data.set(key, value); },
    };
}

describe('saveAllTerms', () => {
    it('deduplicates new terms and preserves existing positions', () => {
        const storage = memoryStorage();
        setTermSaved('CODE', term('x'), true, storage);
        setTermSaved('CODE', term('a'), true, storage);

        expect(saveAllTerms('CODE', [term('a'), term('b'), term('c'), term('b')], storage)).toEqual({
            terms: [term('b'), term('c'), term('a'), term('x')],
            enabled: true,
        });
    });

    it('truncates from the tail at the per-code cap', () => {
        const storage = memoryStorage();
        const existing = Array.from({ length: MAX_SAVED_TERMS_PER_CODE }, (_, index) => term(`old-${index}`));
        storage.setItem(GLOSSARY_SAVED_KEY, JSON.stringify({ v: 1, sessions: { CODE: existing } }));

        const result = saveAllTerms('CODE', [term('new-1'), term('new-2')], storage);
        expect(result.enabled).toBe(true);
        expect(result.terms).toHaveLength(MAX_SAVED_TERMS_PER_CODE);
        expect(result.terms.slice(0, 2)).toEqual([term('new-1'), term('new-2')]);
        expect(result.terms.at(-1)).toEqual(term('old-197'));
    });

    it('returns the original terms and disables saving when writing fails', () => {
        const storage = {
            getItem: () => JSON.stringify({ v: 1, sessions: { CODE: [term('old')] } }),
            setItem: () => { throw new Error('quota'); },
        } as unknown as Storage;

        expect(saveAllTerms('CODE', [term('new')], storage)).toEqual({ terms: [term('old')], enabled: false });
    });

    it('does nothing for empty input', () => {
        const storage = memoryStorage();
        setTermSaved('CODE', term('old'), true, storage);
        expect(saveAllTerms('CODE', [], storage)).toEqual({ terms: [term('old')], enabled: true });
    });
});
