import { useEffect, useRef, type KeyboardEvent } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

export function useFocusTrap<T extends HTMLElement>() {
    const containerRef = useRef<T>(null);
    const previouslyFocusedRef = useRef<Element | null>(
        typeof document === 'undefined' ? null : document.activeElement
    );

    useEffect(() => {
        const container = containerRef.current;

        return () => {
            const previous = previouslyFocusedRef.current;
            if (!(previous instanceof HTMLElement) || !document.contains(previous)) return;
            if (document.activeElement !== document.body && !(container?.contains(document.activeElement))) return;
            previous.focus();
        };
    }, []);

    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Tab') return;
        const container = containerRef.current;
        if (!container) return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !container.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !container.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };

    return { containerRef, onKeyDown };
}
