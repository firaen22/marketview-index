import { describe, expect, it } from 'vitest';
import {
    audienceGlossaryPollDelayMs,
    parseCurrentGlossaryPointer,
    toAudienceGlossarySnapshot,
} from './audienceGlossaryPoll';

describe('audienceGlossaryPoll', () => {
    it('parses a valid resolve pointer', () => {
        expect(parseCurrentGlossaryPointer({ code: 'ABCD2345' })).toBe('ABCD2345');
        expect(parseCurrentGlossaryPointer({ code: 'bad' })).toBeNull();
    });

    it('backs off after repeated misses', () => {
        expect(audienceGlossaryPollDelayMs(0)).toBe(8000);
        expect(audienceGlossaryPollDelayMs(5)).toBe(15000);
    });

    it('maps public session fields without terms', () => {
        const snap = toAudienceGlossarySnapshot('ABCD2345', {
            status: 'live',
            mode: 'gradual',
            currentPage: 3,
            termCount: 2,
            joins: 5,
            updatedAt: 100,
            terms: [{ id: 'x', term: 'bps', explanation: { en: 'a' }, firstPage: 1, unlockedAt: 1 }],
        });
        expect(snap).toEqual({
            kind: 'live',
            code: 'ABCD2345',
            session: {
                status: 'live',
                mode: 'gradual',
                currentPage: 3,
                termCount: 2,
                joins: 5,
                updatedAt: 100,
            },
        });
        expect((snap as { session?: { terms?: unknown } }).session?.terms).toBeUndefined();
    });
});
