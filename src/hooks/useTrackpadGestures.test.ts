// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { GESTURE_IDLE_MS, useTrackpadGestures } from './useTrackpadGestures';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

interface Spies { onSwipeLeft: () => void; onSwipeRight: () => void; onPinch: (d: 'in' | 'out') => void }

function Harness({ enabled, spies }: { enabled: boolean; spies: Spies }) {
    useTrackpadGestures({ enabled, ...spies });
    return null;
}

function mount(spies: Spies, enabled = true) {
    act(() => { root.render(createElement(Harness, { enabled, spies })); });
}

function wheel(init: WheelEventInit & { target?: EventTarget }): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    const target = init.target ?? window;
    act(() => { target.dispatchEvent(event); });
    return event;
}

function spies(): Spies {
    return { onSwipeLeft: vi.fn(), onSwipeRight: vi.fn(), onPinch: vi.fn() };
}

describe('useTrackpadGestures', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        vi.useRealTimers();
    });

    it('turns one swipe (many wheel events plus momentum) into exactly one page turn', () => {
        const s = spies();
        mount(s);
        // 20 events of +10px: threshold crossed on the 8th; the rest is momentum.
        for (let i = 0; i < 20; i += 1) wheel({ deltaX: 10, deltaY: 1 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
        expect(s.onSwipeRight).not.toHaveBeenCalled();
        // Still within the momentum tail: no second turn.
        act(() => { vi.advanceTimersByTime(GESTURE_IDLE_MS - 1); });
        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
        // After the stream goes quiet, the next swipe counts again.
        act(() => { vi.advanceTimersByTime(GESTURE_IDLE_MS + 1); });
        wheel({ deltaX: -100, deltaY: 0 });
        expect(s.onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('swallows horizontal wheel so the browser cannot swipe-navigate', () => {
        mount(spies());
        const event = wheel({ deltaX: 5, deltaY: 0 });
        expect(event.defaultPrevented).toBe(true);
    });

    it('ignores vertical scrolling and a sub-threshold nudge', () => {
        const s = spies();
        mount(s);
        const vertical = wheel({ deltaX: 2, deltaY: 40 });
        expect(vertical.defaultPrevented).toBe(false);
        wheel({ deltaX: 30, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        expect(s.onSwipeRight).not.toHaveBeenCalled();
        // The nudge is forgotten once the gesture is over.
        act(() => { vi.advanceTimersByTime(GESTURE_IDLE_MS + 1); });
        wheel({ deltaX: 60, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
    });

    it('maps a pinch (ctrl+wheel) to zoom steps and blocks browser zoom', () => {
        const s = spies();
        mount(s);
        const first = wheel({ ctrlKey: true, deltaY: -25 });
        expect(first.defaultPrevented).toBe(true);
        expect(s.onPinch).not.toHaveBeenCalled();
        wheel({ ctrlKey: true, deltaY: -25 });
        expect(s.onPinch).toHaveBeenCalledWith('in');
        wheel({ ctrlKey: true, deltaY: 45 });
        expect(s.onPinch).toHaveBeenLastCalledWith('out');
        expect(s.onPinch).toHaveBeenCalledTimes(2);
    });

    it('tolerates NaN deltas and ignores wheel while typing', () => {
        const s = spies();
        mount(s);
        // jsdom's constructor rejects NaN, so poison the getters instead.
        const poisoned = new WheelEvent('wheel', { bubbles: true, cancelable: true });
        Object.defineProperty(poisoned, 'deltaX', { value: Number.NaN });
        Object.defineProperty(poisoned, 'deltaY', { value: Number.NaN });
        expect(() => act(() => { window.dispatchEvent(poisoned); })).not.toThrow();
        const input = document.createElement('input');
        container.appendChild(input);
        wheel({ deltaX: 200, deltaY: 0, target: input });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
    });

    it('does nothing when disabled and removes the listener on unmount', () => {
        const s = spies();
        mount(s, false);
        wheel({ deltaX: 200, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        mount(s, true);
        act(() => { root.unmount(); });
        root = createRoot(container);
        wheel({ deltaX: 200, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
    });
});
