import { describe, expect, it } from 'vitest';
import { nextPresentView } from './presentViewCycle';

describe('nextPresentView', () => {
    const views: Array<'slide' | 'index' | 'heatmap'> = ['slide', 'index', 'heatmap'];

    // forward cycle
    it('moves forward from each view', () => {
        expect(nextPresentView('slide', 'forward')).toBe('index');
        expect(nextPresentView('index', 'forward')).toBe('heatmap');
        expect(nextPresentView('heatmap', 'forward')).toBe('slide');
    });

    // back cycle
    it('moves back from each view', () => {
        expect(nextPresentView('slide', 'back')).toBe('heatmap');
        expect(nextPresentView('index', 'back')).toBe('slide');
        expect(nextPresentView('heatmap', 'back')).toBe('index');
    });

    // invalid current values
    it('returns slide for invalid current values', () => {
        const badCurrents = [null, undefined, '', 'pdf', 42, {}, []];
        for (const curr of badCurrents) {
            expect(nextPresentView(curr as unknown, 'forward')).toBe('slide');
        }
    });

    // invalid directions treated as forward
    it('treats invalid directions as forward', () => {
        const badDirs = [undefined, null, 'FORWARD', 'sideways'];
        for (const dir of badDirs) {
            expect(nextPresentView('index', dir as unknown)).toBe('heatmap');
        }
    });

    // pure function
    it('is pure', () => {
        const a = nextPresentView('index', 'forward');
        const b = nextPresentView('index', 'forward');
        expect(a).toBe(b);
    });
});
