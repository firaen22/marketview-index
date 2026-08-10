import { useEffect, useState } from 'react';

/** Root font-size the rest of the app is designed against (Tailwind's default). */
const BASE_FONT_PX = 16;

const SCALE_CLASS = 'mv-viewport-scale';

/**
 * Reads the scale ratio currently in effect on <html>: 1 on an unscaled route,
 * and up to 2 at 4K on a route that has opted in via `useViewportScale`.
 *
 * Only the handful of things `rem` cannot reach need this — SVG user units in
 * Recharts, and the PDF canvas' CSS size. Anything expressible in rem/em should
 * just be written that way and left alone.
 *
 * Safe to call from a shared component: on routes that never opt in it reads a
 * plain 16px root and returns 1, so the component renders exactly as before.
 */
export function useRootScale(): number {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const root = document.documentElement;
        const read = () => {
            // Read the computed value rather than recomputing the clamp() here:
            // the CSS rule stays the single source of truth for the curve, so
            // the two can never drift apart.
            const px = parseFloat(getComputedStyle(root).fontSize) || BASE_FONT_PX;
            setScale(prev => (prev === px / BASE_FONT_PX ? prev : px / BASE_FONT_PX));
        };
        read();

        window.addEventListener('resize', read);
        // React flushes a child's effects BEFORE its parent's, so on first mount
        // this runs while the route component has yet to add the scale class —
        // the read above sees a 16px root and reports 1. Observing the class
        // attribute catches the add (and the remove on route change) whenever it
        // lands, which effect ordering alone cannot guarantee. PdfViewer showed
        // this concretely: its canvas rendered at 1x until the first resize.
        const observer = new MutationObserver(read);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', read);
        };
    }, []);

    return scale;
}

/**
 * Opts the current route into viewport-scaled typography, and returns the same
 * ratio `useRootScale` reports.
 *
 * Scoped rather than global on purpose: the class lives on <html>, so only the
 * routes that mount this hook scale. The control page and the phone-facing
 * session page keep a 16px root, which is what makes the px -> rem conversions
 * in shared components a no-op for them.
 */
export function useViewportScale(): number {
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add(SCALE_CLASS);
        return () => root.classList.remove(SCALE_CLASS);
    }, []);

    return useRootScale();
}
