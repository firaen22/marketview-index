import type { PresentView } from './settings';

export type CycleDirection = 'forward' | 'back';

const VIEW_ORDER: PresentView[] = ['slide', 'index', 'heatmap'];

// Cycle order is slide -> index -> heatmap -> slide; 'back' walks it the other
// way. A stored view that is no longer one of the three (an older build's
// setting, a corrupted localStorage entry) falls back to the slide, and an
// unrecognised direction moves forward — a presenter mid-talk gets a sane
// view, never a blank one.
export function nextPresentView(current: unknown, direction: unknown): PresentView {
    const index = VIEW_ORDER.indexOf(current as PresentView);
    if (index < 0) return 'slide';
    const offset = direction === 'back' ? -1 : 1;
    return VIEW_ORDER[(index + offset + VIEW_ORDER.length) % VIEW_ORDER.length];
}
