import { describe, expect, it } from 'vitest';
import { isPresentFullscreenMode, isPresentIndexDensity, resolvePresentIndexDensity } from './presentIndexView';

describe('presentIndexView', () => {
    it('rejects remote fullscreen toggle', () => {
        expect(isPresentFullscreenMode('toggle')).toBe(false);
        expect(isPresentFullscreenMode('enter')).toBe(true);
        expect(isPresentFullscreenMode('exit')).toBe(true);
    });

    it('resolves auto density from embed width', () => {
        expect(resolvePresentIndexDensity('auto', 631)).toBe('compact');
        expect(resolvePresentIndexDensity('auto', 1024)).toBe('comfortable');
        expect(resolvePresentIndexDensity('compact', 2000)).toBe('compact');
    });

    it('validates density labels', () => {
        expect(isPresentIndexDensity('auto')).toBe(true);
        expect(isPresentIndexDensity('bogus')).toBe(false);
    });
});
