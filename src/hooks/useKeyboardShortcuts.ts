import { useEffect } from 'react';

interface Handlers {
    onEdit: () => void;
    onFullscreen: () => void;
    onCycleStrip: () => void;
    onToggleView: () => void;
    onToggleQuote: () => void;
    onToggleHints: () => void;
    onEscape: () => void;
    onArrowLeft?: () => void;
    onArrowRight?: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

            if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handlers.onEdit(); }
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handlers.onFullscreen(); }
            if (e.key === 's' || e.key === 'S') { e.preventDefault(); handlers.onCycleStrip(); }
            if (e.key === 'i' || e.key === 'I') { e.preventDefault(); handlers.onToggleView(); }
            if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); handlers.onToggleQuote(); }
            if (e.key === '?' || e.key === '/') { e.preventDefault(); handlers.onToggleHints(); }
            if (e.key === 'ArrowLeft' && handlers.onArrowLeft) { e.preventDefault(); handlers.onArrowLeft(); }
            if (e.key === 'ArrowRight' && handlers.onArrowRight) { e.preventDefault(); handlers.onArrowRight(); }
            if (e.key === 'Escape') handlers.onEscape();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // handlers object is re-created each render; stable via the deps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        handlers.onEdit,
        handlers.onFullscreen,
        handlers.onCycleStrip,
        handlers.onToggleView,
        handlers.onToggleQuote,
        handlers.onToggleHints,
        handlers.onEscape,
        handlers.onArrowLeft,
        handlers.onArrowRight,
    ]);
}
