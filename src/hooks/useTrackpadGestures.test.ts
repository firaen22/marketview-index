// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { GESTURE_IDLE_MS, forwardTrackpadEvents, useTrackpadGestures } from './useTrackpadGestures';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

interface Spies { onSwipeLeft: () => void; onSwipeRight: () => void; onPinch: (d: 'in' | 'out') => void | 'latch'; onTwoFingerTap: () => void }

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

function rightClick(target?: EventTarget): MouseEvent {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const t = target ?? window;
    act(() => { t.dispatchEvent(event); });
    return event;
}

function spies(): Spies {
    return { onSwipeLeft: vi.fn(), onSwipeRight: vi.fn(), onPinch: vi.fn(), onTwoFingerTap: vi.fn() };
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

    it('fires swipe when deltaX reaches 80 threshold exactly, but 79 accumulated does not', () => {
        const s = spies();
        mount(s);
        // 79px accumulated: just below the 80px threshold, must not fire.
        wheel({ deltaX: 79, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        // 1px more brings accumulation to exactly 80px and fires.
        wheel({ deltaX: 1, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('algebraically accumulates alternating deltas and never fires twice in one stream', () => {
        const s = spies();
        mount(s);
        // Alternating signs cancel out in the accumulator: 50 - 50 + 50 = 50 (< 80).
        wheel({ deltaX: 50, deltaY: 0 });
        wheel({ deltaX: -50, deltaY: 0 });
        wheel({ deltaX: 50, deltaY: 0 });
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        expect(s.onSwipeRight).not.toHaveBeenCalled();
        // Reaching 100 fires the swipe.
        wheel({ deltaX: 50, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
        // Subsequent events in the same stream (even in reverse) do not fire again.
        wheel({ deltaX: -100, deltaY: 0 });
        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
        expect(s.onSwipeRight).not.toHaveBeenCalled();
    });

    it('ignores diagonal input where |deltaX| === |deltaY| without swallowing', () => {
        const s = spies();
        mount(s);
        // Equal deltas are diagonal: neither swipe nor swallowed.
        const event = wheel({ deltaX: 50, deltaY: 50 });
        expect(event.defaultPrevented).toBe(false);
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        expect(s.onSwipeRight).not.toHaveBeenCalled();
    });

    it('ignores pure vertical scroll with deltaX = 0 and large deltaY', () => {
        const s = spies();
        mount(s);
        const event = wheel({ deltaX: 0, deltaY: 200 });
        expect(event.defaultPrevented).toBe(false);
        expect(s.onSwipeLeft).not.toHaveBeenCalled();
        expect(s.onSwipeRight).not.toHaveBeenCalled();
    });

    it('resets swipe lock only after GESTURE_IDLE_MS of silence', () => {
        const s = spies();
        mount(s);
        // Initial burst triggers swipe.
        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);

        // Gap longer than GESTURE_IDLE_MS (300 ms > 250 ms) resets lock and allows next swipe.
        act(() => { vi.advanceTimersByTime(300); });
        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(2);

        // Gap shorter than GESTURE_IDLE_MS (200 ms < 250 ms) keeps lock active.
        act(() => { vi.advanceTimersByTime(200); });
        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(2);
    });

    it('handles NaN deltaY in pinch without throwing, swallowing event and preserving accumulator', () => {
        const s = spies();
        mount(s);
        // NaN deltaY pinch event: must swallow default, not call handler, not poison accumulator.
        const poisoned = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true });
        Object.defineProperty(poisoned, 'deltaY', { value: Number.NaN });
        act(() => { window.dispatchEvent(poisoned); });
        expect(poisoned.defaultPrevented).toBe(true);
        expect(s.onPinch).not.toHaveBeenCalled();

        // Following real pinch reaches threshold cleanly.
        wheel({ ctrlKey: true, deltaY: 40 });
        expect(s.onPinch).toHaveBeenCalledTimes(1);
        expect(s.onPinch).toHaveBeenCalledWith('out');
    });

    it('ignores ctrlKey pinch events on typing targets without preventing default', () => {
        const s = spies();
        mount(s);
        const textarea = document.createElement('textarea');
        container.appendChild(textarea);
        const event = wheel({ ctrlKey: true, deltaY: 50, target: textarea });
        expect(event.defaultPrevented).toBe(false);
        expect(s.onPinch).not.toHaveBeenCalled();
    });

    it('registers no wheel listener and leaves events unprevented when enabled is false', () => {
        const s = spies();
        mount(s, false);
        const swipeEvent = wheel({ deltaX: 100, deltaY: 0 });
        expect(swipeEvent.defaultPrevented).toBe(false);
        expect(s.onSwipeLeft).not.toHaveBeenCalled();

        const pinchEvent = wheel({ ctrlKey: true, deltaY: 50 });
        expect(pinchEvent.defaultPrevented).toBe(false);
        expect(s.onPinch).not.toHaveBeenCalled();
    });

    it('does not leave stale listeners on rapid unmount and remount', () => {
        const s = spies();
        mount(s, true);
        // Rapid unmount and remount in succession.
        act(() => { root.unmount(); });
        root = createRoot(container);
        mount(s, true);

        wheel({ deltaX: 100, deltaY: 0 });
        expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    describe('two-finger tap (contextmenu)', () => {
        it('calls the handler once and prevents the default context menu', () => {
            const s = spies();
            mount(s);
            const event = rightClick();
            expect(s.onTwoFingerTap).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
        });

        it('still prevents the default even with no handler supplied', () => {
            mount({ onSwipeLeft: vi.fn(), onSwipeRight: vi.fn(), onPinch: vi.fn(), onTwoFingerTap: undefined });
            const event = rightClick();
            expect(event.defaultPrevented).toBe(true);
        });

        it('ignores a contextmenu inside an input so paste still works', () => {
            const s = spies();
            mount(s);
            const input = document.createElement('input');
            container.appendChild(input);
            const event = rightClick(input);
            expect(s.onTwoFingerTap).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        });

        it('removes the listener on unmount so no handler runs', () => {
            const s = spies();
            mount(s);
            act(() => { root.unmount(); });
            root = createRoot(container);
            rightClick();
            expect(s.onTwoFingerTap).not.toHaveBeenCalled();
        });
    });
    describe('pinch latch', () => {
        it("swallows the rest of the stream after a handler returns 'latch', until idle", () => {
            const s = spies();
            (s.onPinch as ReturnType<typeof vi.fn>).mockReturnValueOnce('latch');
            mount(s);
            wheel({ ctrlKey: true, deltaY: -40 });
            expect(s.onPinch).toHaveBeenCalledTimes(1);
            // Fingers still spreading: two more threshold crossings, no callbacks.
            wheel({ ctrlKey: true, deltaY: -40 });
            const swallowed = wheel({ ctrlKey: true, deltaY: -40 });
            expect(s.onPinch).toHaveBeenCalledTimes(1);
            expect(swallowed.defaultPrevented).toBe(true);
            // A fresh pinch after the idle gap steps again.
            act(() => { vi.advanceTimersByTime(GESTURE_IDLE_MS + 1); });
            wheel({ ctrlKey: true, deltaY: -40 });
            expect(s.onPinch).toHaveBeenCalledTimes(2);
        });

        it('keeps stepping when the handler returns nothing', () => {
            const s = spies();
            mount(s);
            wheel({ ctrlKey: true, deltaY: -40 });
            wheel({ ctrlKey: true, deltaY: -40 });
            wheel({ ctrlKey: true, deltaY: -40 });
            expect(s.onPinch).toHaveBeenCalledTimes(3);
        });
    });

    describe('forwardTrackpadEvents (iframe bridge)', () => {
        let source: HTMLDivElement;
        let stop: () => void;
        beforeEach(() => {
            source = document.createElement('div');
            stop = forwardTrackpadEvents(source, window);
        });
        afterEach(() => { stop(); });

        it('re-dispatches a horizontal swipe to the parent and cancels the original', () => {
            const s = spies();
            mount(s);
            const event = wheel({ deltaX: 100, deltaY: 0, target: source });
            expect(s.onSwipeLeft).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
        });

        it('forwards a pinch with ctrlKey intact', () => {
            const s = spies();
            mount(s);
            const event = wheel({ ctrlKey: true, deltaY: -40, target: source });
            expect(s.onPinch).toHaveBeenCalledWith('in');
            expect(event.defaultPrevented).toBe(true);
        });

        it('leaves a vertical scroll inside the iframe alone', () => {
            const s = spies();
            mount(s);
            const event = wheel({ deltaX: 0, deltaY: 120, target: source });
            expect(s.onSwipeLeft).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        });

        it('forwards a two-finger tap and cancels the iframe context menu', () => {
            const s = spies();
            mount(s);
            const event = rightClick(source);
            expect(s.onTwoFingerTap).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
        });

        it('does not forward from a text field inside the iframe', () => {
            const s = spies();
            mount(s);
            const input = document.createElement('input');
            source.appendChild(input);
            const event = rightClick(input);
            expect(s.onTwoFingerTap).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        });

        it('stops forwarding after cleanup', () => {
            const s = spies();
            mount(s);
            stop();
            wheel({ deltaX: 100, deltaY: 0, target: source });
            expect(s.onSwipeLeft).not.toHaveBeenCalled();
            stop = () => {};
        });
    });
});
