import { useEffect, useRef, useState } from 'react';

export function useTickerSnap() {
    const ref = useRef<HTMLDivElement | null>(null);
    const [shift, setShift] = useState(0);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const measure = () => {
            const nextShift = Math.round(element.getBoundingClientRect().width / 2);
            setShift(currentShift => currentShift === nextShift ? currentShift : nextShift);
        };

        measure();

        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const style = shift >= 1
        ? ({
            '--ticker-shift': `${shift}px`,
            animationTimingFunction: `steps(${shift}, end)`,
        } as React.CSSProperties)
        : undefined;

    return { ref, style };
}
