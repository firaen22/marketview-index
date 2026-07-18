import { describe, expect, it } from 'vitest';
import {
    classifyAuth,
    classifyDeck,
    classifyJargon,
    classifyMacro,
    classifyMarket,
    classifyProjector,
    classifySlide,
} from './preflight';

const validSlide = { mode: 'markdown', content: '# Ready', updatedAt: 1 };
const hugeString = 'x'.repeat(100_000);

describe('preflight classifiers', () => {
    it('classifies slide state by status and validated shape', () => {
        expect(classifySlide(500, { slide: validSlide })).toEqual({ status: 'fail', detail: 'HTTP 500' });
        expect(classifySlide(200, { slide: validSlide })).toEqual({ status: 'pass', detail: 'mode markdown' });
        expect(classifySlide(200, { slide: { mode: 'markdown', content: '# Missing timestamp' } })).toEqual({
            status: 'fail',
            detail: 'invalid slide shape',
        });
    });

    it('classifies deck checks without downloading body assumptions', () => {
        expect(classifyDeck('markdown', 200, 'application/pdf')).toEqual({ status: 'skip', detail: 'no PDF deck' });
        expect(classifyDeck('pdf', null, null)).toEqual({ status: 'fail', detail: 'unreachable/timeout' });
        expect(classifyDeck('pdf', 200, 'application/pdf')).toEqual({ status: 'pass', detail: 'HTTP 200 application/pdf' });
        expect(classifyDeck('pdf', 204, null)).toEqual({ status: 'pass', detail: 'HTTP 204' });
        expect(classifyDeck('pdf', 200, 'text/html')).toEqual({
            status: 'warn',
            detail: 'unexpected content-type text/html',
        });
        expect(classifyDeck('pdf', 404, 'application/pdf')).toEqual({ status: 'fail', detail: 'HTTP 404' });
    });

    it('classifies market data responses', () => {
        expect(classifyMarket(503, { success: true, data: [{}] })).toEqual({ status: 'fail', detail: 'HTTP 503' });
        expect(classifyMarket(200, { success: false, data: [{}] })).toEqual({ status: 'fail', detail: 'success false' });
        expect(classifyMarket(200, { success: true })).toEqual({ status: 'fail', detail: 'malformed response' });
        expect(classifyMarket(200, { success: true, data: 'nope' })).toEqual({ status: 'fail', detail: 'malformed response' });
        expect(classifyMarket(200, { success: true, data: [{}], source: 'server_stale_cache' })).toEqual({
            status: 'warn',
            detail: 'serving stale cache',
        });
        expect(classifyMarket(200, { success: true, data: [] })).toEqual({ status: 'warn', detail: '0 items' });
        expect(classifyMarket(200, { success: true, data: [{}, {}], source: 'cron_updated_cache' })).toEqual({
            status: 'pass',
            detail: '2 items',
        });
    });

    it('classifies macro data responses', () => {
        expect(classifyMacro(500, { success: true, data: [{}] })).toEqual({ status: 'fail', detail: 'HTTP 500' });
        expect(classifyMacro(200, { success: false, data: [{}] })).toEqual({ status: 'fail', detail: 'success false' });
        expect(classifyMacro(200, { success: true })).toEqual({ status: 'fail', detail: 'malformed response' });
        expect(classifyMacro(200, { success: true, data: {} })).toEqual({ status: 'fail', detail: 'malformed response' });
        expect(classifyMacro(200, { success: true, data: [] })).toEqual({ status: 'warn', detail: '0 items' });
        expect(classifyMacro(200, { success: true, data: [{}] })).toEqual({ status: 'pass', detail: '1 items' });
    });

    it('classifies projector liveness and keeps invalid times readable', () => {
        expect(classifyProjector(null, 10_000)).toEqual({ status: 'warn', detail: 'not reporting - open /present' });
        expect(classifyProjector({ at: 9000 }, 10_000)).toEqual({ status: 'pass', detail: 'live' });
        expect(classifyProjector({ at: 1000 }, 20_000)).toEqual({ status: 'warn', detail: 'last report 19s ago' });
        expect(classifyProjector({ at: NaN }, 20_000)).toEqual({ status: 'warn', detail: 'invalid report time' });
        expect(classifyProjector({ at: 1000 }, NaN)).toEqual({ status: 'warn', detail: 'invalid report time' });
        expect(classifyProjector({ at: 30_000 }, 20_000)).toEqual({ status: 'pass', detail: 'live' });
    });

    it('classifies write auth probe statuses', () => {
        expect(classifyAuth(400)).toEqual({ status: 'pass', detail: 'write key accepted' });
        expect(classifyAuth(401)).toEqual({ status: 'fail', detail: 'write key rejected or missing' });
        expect(classifyAuth(429)).toEqual({ status: 'warn', detail: 'rate limited' });
        expect(classifyAuth(500)).toEqual({ status: 'warn', detail: 'HTTP 500' });
    });

    it('classifies jargon probe responses', () => {
        expect(classifyJargon(200, { success: true, terms: [{}], source: 'cache' })).toEqual({ status: 'pass', detail: 'cached' });
        expect(classifyJargon(200, { success: true, terms: [{}] })).toEqual({ status: 'pass', detail: 'fresh' });
        expect(classifyJargon(503, {})).toEqual({ status: 'fail', detail: 'no AI key configured' });
        expect(classifyJargon(502, {})).toEqual({ status: 'fail', detail: 'AI processing failed' });
        expect(classifyJargon(429, {})).toEqual({ status: 'fail', detail: 'HTTP 429' });
        expect(classifyJargon(200, { success: false, terms: [] })).toEqual({ status: 'fail', detail: 'malformed success' });
        expect(classifyJargon(200, { success: true })).toEqual({ status: 'fail', detail: 'malformed success' });
    });

    it('does not throw on malformed edge inputs', () => {
        const weirdPayloads = [undefined, null, [], {}, NaN, 0, hugeString];
        for (const payload of weirdPayloads) {
            expect(() => classifySlide(200, payload)).not.toThrow();
            expect(() => classifyMarket(200, payload)).not.toThrow();
            expect(() => classifyMacro(200, payload)).not.toThrow();
            expect(() => classifyJargon(200, payload)).not.toThrow();
        }

        const weirdNumbers = [NaN, Infinity, -1, 0];
        for (const value of weirdNumbers) {
            expect(() => classifyDeck(String(value), value, hugeString)).not.toThrow();
            expect(() => classifyProjector({ at: value }, value)).not.toThrow();
            expect(() => classifyAuth(value)).not.toThrow();
        }

        expect(classifySlide(200, null).detail).not.toContain('NaN');
        expect(classifyMarket(200, null).detail).not.toContain('NaN');
        expect(classifyMacro(200, null).detail).not.toContain('NaN');
        expect(classifyProjector({ at: NaN }, NaN).detail).not.toContain('NaN');
    });
});
