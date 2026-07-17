import { describe, expect, it } from 'vitest';
import { shouldExecute } from '../../lib/presentCommand';
import { filterFreshPageCommands, presentCommandBackoffMs, presentCommandPollUrl } from './usePresentCommand';

describe('usePresentCommand helpers', () => {
    it('uses the glossary-style bounded reconnect backoff', () => {
        expect(presentCommandBackoffMs(1)).toBe(5000);
        expect(presentCommandBackoffMs(2)).toBe(10000);
        expect(presentCommandBackoffMs(3)).toBe(20000);
        expect(presentCommandBackoffMs(99)).toBe(20000);
    });

    it('rejects duplicate and stale commands through the shared execution guard', () => {
        const command = { v: 1, id: 'cmd-1', kind: 'clear', symbols: [], issuedAt: 1_000_000 } as const;

        expect(shouldExecute(command, null, 1_000_000)).toBe(true);
        expect(shouldExecute(command, 'cmd-1', 1_000_000)).toBe(false);
        expect(shouldExecute(command, null, 1_120_001)).toBe(false);
        expect(shouldExecute({ ...command, issuedAt: 2_000_000 }, null, 1_000_000)).toBe(true);
    });

    it('appends projector state params with URLSearchParams encoding', () => {
        expect(presentCommandPollUrl({ mode: 'pdf', page: 2, v: 0 })).toBe('/api/present-command?st=1&mode=pdf&page=2&v=0');
        expect(presentCommandPollUrl({ mode: 'heatmap', page: 1, v: 123 })).toBe('/api/present-command?st=1&mode=heatmap&page=1&v=123');
        expect(presentCommandPollUrl({ mode: 'pdf', page: 2, v: 0, lid: 'cmd-1' })).toBe('/api/present-command?st=1&mode=pdf&page=2&v=0&lid=cmd-1');
    });

    it('keeps the bare poll URL when getState returns null', () => {
        expect(presentCommandPollUrl(null)).toBe('/api/present-command');
    });

    it('keeps only valid, fresh page commands from a drained queue payload', () => {
        const page = (id: string, issuedAt: number) => ({ v: 1, id, kind: 'page', symbols: [], direction: 'next', issuedAt });
        const now = 1_000_000;

        expect(filterFreshPageCommands([
            page('fresh', now - 14_999),
            page('stale', now - 15_001),
            { v: 1, id: 'not-page', kind: 'clear', symbols: [], issuedAt: now },
            { kind: 'page' },
            'garbage',
        ], now).map(c => c.id)).toEqual(['fresh']);
        expect(filterFreshPageCommands(undefined, now)).toEqual([]);
        expect(filterFreshPageCommands('nope', now)).toEqual([]);
    });
});
