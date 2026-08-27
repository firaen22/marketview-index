import { useCallback, useEffect, useRef, useState } from 'react';

export function useTickerSnap() {
    const [shift, setShift] = useState(0);
    const observerRef = useRef<ResizeObserver | null>(null);

    // A CALLBACK ref, not useRef + useEffect([]): the ticker track is not
    // rendered while market data is still loading (DashboardHeader gates it on
    // `isLoading`, which starts true), so a mount-only effect reads ref.current
    // as null, returns, and never runs again once the track appears — leaving
    // the snap permanently off on the only path the dashboard actually takes.
    // A callback ref fires whenever the element attaches or detaches.
    const ref = useCallback((element: HTMLDivElement | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (!element) return;

        const measure = () => {
            const nextShift = Math.round(element.getBoundingClientRect().width / 2);
            setShift(currentShift => currentShift === nextShift ? currentShift : nextShift);
        };

        measure();

        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        observerRef.current = observer;
    }, []);

    useEffect(() => () => {
        observerRef.current?.disconnect();
        observerRef.current = null;
    }, []);

    const style = shift >= 1
        ? ({
            '--ticker-shift': `${shift}px`,
            animationTimingFunction: `steps(${shift}, end)`,
        } as React.CSSProperties)
        : undefined;

    return { ref, style };
}
