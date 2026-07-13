import { describe, expect, it } from 'vitest';
import type { GlossaryPollState, PollResult } from './useGlossaryPoll';
import {
    nextPollDelayMs,
    normalizeAudienceCode,
    reconnectDelayMs,
    reducePollState,
} from './useGlossaryPoll';

const emptyState: GlossaryPollState = {
    status: 'loading',
    session: null,
    reconnecting: false,
    failureCount: 0,
    error: null,
};

const liveSession = {
    status: 'live' as const,
    mode: 'gradual' as const,
    currentPage: 3,
    termCount: 1,
    joins: 2,
    updatedAt: 100,
    terms: [{
        id: 'bps',
        term: 'bps',
        explanation: { en: 'basis points' },
        firstPage: 3,
        unlockedAt: 100,
    }],
};

describe('glossary poll pure helpers', () => {
    it('normalizes lowercase valid codes and rejects invalid codes before fetch', () => {
        expect(normalizeAudienceCode(' abcd2345 ')).toBe('ABCD2345');
        expect(normalizeAudienceCode('ABC12345')).toBeNull();
        expect(normalizeAudienceCode('ABCL2345')).toBeNull();
        expect(normalizeAudienceCode(undefined)).toBeNull();
    });

    it('resets reconnect state on success and keeps polling live sessions', () => {
        const result: PollResult = { type: 'success', session: liveSession };
        const state = reducePollState({ ...emptyState, failureCount: 2, reconnecting: true }, result);

        expect(state).toEqual({
            status: 'ready',
            session: liveSession,
            reconnecting: false,
            failureCount: 0,
            error: null,
        });
        expect(nextPollDelayMs(result, state)).toBe(5000);
    });

    it('stops polling after an ended session success', () => {
        const result: PollResult = { type: 'success', session: { ...liveSession, status: 'ended' } };
        const state = reducePollState(emptyState, result);

        expect(state.session?.status).toBe('ended');
        expect(nextPollDelayMs(result, state)).toBeNull();
    });

    it('keeps last data and backs off network or server errors', () => {
        const withData: GlossaryPollState = {
            status: 'ready',
            session: liveSession,
            reconnecting: false,
            failureCount: 0,
            error: null,
        };
        const first = reducePollState(withData, { type: 'network_error' });
        const second = reducePollState(first, { type: 'server_error', message: 'http_503' });
        const third = reducePollState(second, { type: 'network_error' });

        expect(first.session).toBe(liveSession);
        expect(first.reconnecting).toBe(true);
        expect(reconnectDelayMs(first.failureCount)).toBe(5000);
        expect(reconnectDelayMs(second.failureCount)).toBe(10000);
        expect(reconnectDelayMs(third.failureCount)).toBe(20000);
        expect(reconnectDelayMs(99)).toBe(20000);
        expect(nextPollDelayMs({ type: 'server_error' }, third)).toBe(20000);
    });

    it('handles 404 as terminal not-found and 429 as a 10s retry', () => {
        const notFound = reducePollState(emptyState, { type: 'not_found' });
        const rateLimited = reducePollState(emptyState, { type: 'rate_limited' });

        expect(notFound).toMatchObject({ status: 'not_found', reconnecting: false, error: 'not_found' });
        expect(nextPollDelayMs({ type: 'not_found' }, notFound)).toBeNull();
        expect(rateLimited).toMatchObject({ status: 'rate_limited', reconnecting: true, error: 'rate_limited' });
        expect(nextPollDelayMs({ type: 'rate_limited' }, rateLimited)).toBe(10000);
    });
});
