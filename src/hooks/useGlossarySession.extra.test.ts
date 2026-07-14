import { describe, expect, it } from 'vitest';
import {
    isDuplicatePushPayload,
    parseStoredJoinCode,
    pushPayloadKey,
    shouldFlushBeforeReplace,
    type GlossaryPushPayload,
} from './useGlossarySession';

const base = (overrides: Partial<GlossaryPushPayload> = {}): GlossaryPushPayload => ({
    code: 'c',
    page: 1,
    lang: 'zh-TW',
    terms: [],
    ...overrides,
});

describe('pushPayloadKey', () => {
    it('is sensitive to term order — same terms in different positions produce different keys', () => {
        const a = base({ terms: [{ term: 'alpha', explanation: 'A' }, { term: 'beta', explanation: 'B' }] });
        const b = base({ terms: [{ term: 'beta', explanation: 'B' }, { term: 'alpha', explanation: 'A' }] });
        expect(pushPayloadKey(a)).not.toBe(pushPayloadKey(b));
    });

    it('treats payloads as different when only explanation differs', () => {
        const a = base({ terms: [{ term: 'same', explanation: 'explanation A' }] });
        const b = base({ terms: [{ term: 'same', explanation: 'explanation B' }] });
        expect(pushPayloadKey(a)).not.toBe(pushPayloadKey(b));
    });

    it('preserves duplicate term strings in the serialized array', () => {
        const dupe = { term: 'x', explanation: 'e' };
        const p = base({ terms: [dupe, dupe] });
        const key = pushPayloadKey(p);
        expect(key).toBe(JSON.stringify({
            code: 'c',
            page: 1,
            lang: 'zh-TW',
            terms: [{ term: 'x', explanation: 'e' }, { term: 'x', explanation: 'e' }],
        }));
    });

    it('includes unicode / zh-TW characters faithfully in the key', () => {
        const p = base({ terms: [{ term: '驛馬', explanation: '流動之象' }] });
        expect(pushPayloadKey(p)).toContain('驛馬');
        expect(pushPayloadKey(p)).toContain('流動之象');
    });

    it('empty-string term is serialized and distinguishes payloads', () => {
        const a = base({ terms: [{ term: '', explanation: 'e' }] });
        const b = base({ terms: [{ term: 'not-empty', explanation: 'e' }] });
        expect(pushPayloadKey(a)).not.toBe(pushPayloadKey(b));
    });
});

describe('isDuplicatePushPayload', () => {
    it('returns false when first argument is null', () => {
        const p = base({ terms: [{ term: 't', explanation: 'e' }] });
        expect(isDuplicatePushPayload(null, p)).toBe(false);
    });

    it('returns true when payloads are identical', () => {
        const p = base({ terms: [{ term: 't', explanation: 'e' }] });
        expect(isDuplicatePushPayload(p, p)).toBe(true);
    });
});

describe('shouldFlushBeforeReplace', () => {
    it('returns false when pending is null', () => {
        expect(shouldFlushBeforeReplace(null, base())).toBe(false);
    });

    it('returns false when pending has empty terms array', () => {
        expect(shouldFlushBeforeReplace(base({ terms: [] }), base())).toBe(false);
    });

    it('returns true when pending and next differ by code', () => {
        const pending = base({ code: 'A', terms: [{ term: 't', explanation: 'e' }] });
        const next = base({ code: 'B', terms: [{ term: 't', explanation: 'e' }] });
        expect(shouldFlushBeforeReplace(pending, next)).toBe(true);
    });

    it('returns false when all pending term names exist in next (even with different explanation)', () => {
        const pending = base({ terms: [{ term: 't', explanation: 'old' }] });
        const next = base({ terms: [{ term: 't', explanation: 'new' }] });
        expect(shouldFlushBeforeReplace(pending, next)).toBe(false);
    });

    it('returns true when pending contains a term name absent from next', () => {
        const pending = base({ terms: [{ term: 'gone', explanation: 'e' }] });
        const next = base({ terms: [{ term: 'other', explanation: 'e' }] });
        expect(shouldFlushBeforeReplace(pending, next)).toBe(true);
    });

    it('duplicate term strings in pending are satisfied if next has at least one match', () => {
        const pending = base({
            terms: [{ term: 'x', explanation: 'e' }, { term: 'x', explanation: 'e' }],
        });
        const next = base({ terms: [{ term: 'x', explanation: 'e' }] });
        expect(shouldFlushBeforeReplace(pending, next)).toBe(false);
    });
});

describe('parseStoredJoinCode', () => {
    it('JSON string "" (two double-quote chars) returns null', () => {
        expect(parseStoredJoinCode('""')).toBe(null);
    });

    it('{} returns null (no joinCode property)', () => {
        expect(parseStoredJoinCode('{}')).toBe(null);
    });

    it('[] returns null (array is not a string or {joinCode} object)', () => {
        expect(parseStoredJoinCode('[]')).toBe(null);
    });

    it('the string "null" returns null (JSON.parse yields null, not string/object)', () => {
        expect(parseStoredJoinCode('null')).toBe(null);
    });

    it('a JSON number returns null (falls through both typeof checks)', () => {
        expect(parseStoredJoinCode('42')).toBe(null);
    });
});
