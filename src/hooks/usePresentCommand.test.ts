import { describe, expect, it } from 'vitest';
import { shouldExecute } from '../../lib/presentCommand';
import { presentCommandBackoffMs } from './usePresentCommand';

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
});
