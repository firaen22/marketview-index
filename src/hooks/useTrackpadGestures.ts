import { useEffect, useRef } from 'react';

// A Magic Trackpad on the projector laptop reports two-finger swipes as a
// stream of `wheel` events with deltaX (dozens per swipe, then momentum), and
// a pinch as `wheel` with ctrlKey set. Left alone, the horizontal stream is
// Chrome/Safari's swipe-to-go-back gesture — which navigates AWAY from
// /present mid-talk — and the pinch zooms the whole browser page. This hook
// turns one swipe into exactly one page turn and one pinch into zoom steps.
export const SWIPE_THRESHOLD_PX = 80;
export const PINCH_THRESHOLD_PX = 40;
// A swipe's momentum tail keeps emitting for ~1 s; the gesture is over once
// the stream has been quiet this long, and only then may the next one fire.
export const GESTURE_IDLE_MS = 250;

interface Options {
    enabled: boolean;
    onSwipeLeft?: () => void;   // fingers move left → content advances (next page)
    onSwipeRight?: () => void;  // fingers move right → previous page
    onPinch?: (direction: 'in' | 'out') => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return !!element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' || !!element.isContentEditable);
}

export function useTrackpadGestures({ enabled, onSwipeLeft, onSwipeRight, onPinch }: Options): void {
    const handlersRef = useRef({ onSwipeLeft, onSwipeRight, onPinch });
    handlersRef.current = { onSwipeLeft, onSwipeRight, onPinch };

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let swipeAccumulator = 0;
        let pinchAccumulator = 0;
        // Set once a swipe has fired; cleared only after GESTURE_IDLE_MS of
        // silence so the momentum tail cannot turn a second page.
        let swipeFired = false;
        let idleTimer: number | null = null;

        const armIdle = () => {
            if (idleTimer !== null) window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(() => {
                idleTimer = null;
                swipeAccumulator = 0;
                pinchAccumulator = 0;
                swipeFired = false;
            }, GESTURE_IDLE_MS);
        };

        const onWheel = (event: WheelEvent) => {
            if (isTypingTarget(event.target)) return;
            const deltaX = Number.isFinite(event.deltaX) ? event.deltaX : 0;
            const deltaY = Number.isFinite(event.deltaY) ? event.deltaY : 0;

            if (event.ctrlKey) {
                // macOS pinch. Always swallow it: browser page-zoom on the
                // projector is never wanted, even with no zoom handler.
                event.preventDefault();
                armIdle();
                if (!handlersRef.current.onPinch) return;
                pinchAccumulator += deltaY;
                if (Math.abs(pinchAccumulator) >= PINCH_THRESHOLD_PX) {
                    // Spreading fingers reports negative deltaY.
                    handlersRef.current.onPinch(pinchAccumulator < 0 ? 'in' : 'out');
                    pinchAccumulator = 0;
                }
                return;
            }

            if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) return;
            // Horizontal stream: swallow so the browser never reads it as
            // swipe-to-navigate, then count towards one page turn.
            event.preventDefault();
            armIdle();
            if (swipeFired) return;
            swipeAccumulator += deltaX;
            if (Math.abs(swipeAccumulator) < SWIPE_THRESHOLD_PX) return;
            swipeFired = true;
            swipeAccumulator = 0;
            // Natural scrolling: fingers moving left produce positive deltaX.
            if (deltaX > 0) handlersRef.current.onSwipeLeft?.();
            else handlersRef.current.onSwipeRight?.();
        };

        window.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            window.removeEventListener('wheel', onWheel);
            if (idleTimer !== null) window.clearTimeout(idleTimer);
        };
    }, [enabled]);
}
