import { describe, expect, it } from 'vitest';
import type { ClientGlossarySession } from '../glossaryApi';
import {
    isDuplicatePushPayload,
    parseStoredJoinCode,
    pushPayloadKey,
    shouldClearStoredSession,
    shouldFlushBeforeReplace,
    shouldSchedulePush,
    type GlossaryPushPayload,
} from './useGlossarySession';

const payload: GlossaryPushPayload = {
    code: 'ABCDEFGH',
    page: 3,
    lang: 'en',
    terms: [{ term: 'bps', explanation: 'Basis points' }],
};

describe('useGlossarySession helpers', () => {
    it('parses legacy and current stored join-code values', () => {
        expect(parseStoredJoinCode(null)).toBeNull();
        expect(parseStoredJoinCode('  ABCDEFGH  ')).toBe('ABCDEFGH');
        expect(parseStoredJoinCode('"HJKMNPQR"')).toBe('HJKMNPQR');
        expect(parseStoredJoinCode('{"joinCode":"23456789"}')).toBe('23456789');
        expect(parseStoredJoinCode('{"wrong":"23456789"}')).toBeNull();
    });

    it('keys payloads by code, page, lang, and exact term contents', () => {
        expect(pushPayloadKey(payload)).toBe(pushPayloadKey({ ...payload, terms: [...payload.terms] }));
        expect(isDuplicatePushPayload(payload, { ...payload, terms: [{ term: 'bps', explanation: 'Basis points' }] })).toBe(true);
        expect(isDuplicatePushPayload(payload, { ...payload, page: 4 })).toBe(false);
        expect(isDuplicatePushPayload(payload, { ...payload, terms: [{ term: 'bps', explanation: 'Other' }] })).toBe(false);
    });

    it('drops identical consecutive or already pending pushes', () => {
        expect(shouldSchedulePush(payload, null, null)).toBe(true);
        expect(shouldSchedulePush(payload, payload, null)).toBe(false);
        expect(shouldSchedulePush(payload, null, payload)).toBe(false);
        expect(shouldSchedulePush({ ...payload, terms: [] }, payload, null)).toBe(true);
    });

    it('clears persisted rehydrate state only for missing sessions', () => {
        const session = {
            joinCode: 'ABCDEFGH',
            status: 'ended',
            mode: 'gradual',
            currentPage: 4,
            termCount: 1,
            joins: 2,
            updatedAt: 100,
            terms: [],
        } satisfies ClientGlossarySession;
        expect(shouldClearStoredSession(null, session)).toBe(false);
        expect(shouldClearStoredSession(null, null)).toBe(true);
        expect(shouldClearStoredSession(404, session)).toBe(true);
    });
});

describe('shouldFlushBeforeReplace', () => {
    it('does not flush when pending is null', () => {
        expect(shouldFlushBeforeReplace(null, payload)).toBe(false);
    });

    it('does not flush when pending has empty terms', () => {
        expect(shouldFlushBeforeReplace({ ...payload, terms: [] }, { ...payload, page: 4 })).toBe(false);
    });

    it('flushes when next has empty terms and pending has terms', () => {
        expect(shouldFlushBeforeReplace(payload, { ...payload, terms: [] })).toBe(true);
    });

    it('flushes when page, lang, or code differs', () => {
        expect(shouldFlushBeforeReplace(payload, { ...payload, page: 4 })).toBe(true);
        expect(shouldFlushBeforeReplace(payload, { ...payload, lang: 'zh-TW' })).toBe(true);
        expect(shouldFlushBeforeReplace(payload, { ...payload, code: 'HJKMNPQR' })).toBe(true);
    });

    it('does not flush when next terms are a same-key strict superset', () => {
        expect(shouldFlushBeforeReplace(payload, {
            ...payload,
            terms: [
                ...payload.terms,
                { term: 'duration', explanation: 'Duration' },
            ],
        })).toBe(false);
    });

    it('flushes when same-key next terms miss a pending term', () => {
        expect(shouldFlushBeforeReplace({
            ...payload,
            terms: [
                { term: 'bps', explanation: 'Basis points' },
                { term: 'duration', explanation: 'Duration' },
            ],
        }, payload)).toBe(true);
    });
});
