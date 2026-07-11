import { useEffect } from 'react';

interface Handlers {
    onEdit: () => void;
    onFullscreen: () => void;
    onCycleStrip: () => void;
    onToggleView: () => void;
    onTogglePlay?: () => void;
    onToggleQuote: () => void;
    onToggleHints: () => void;
    onEscape: () => void;
    onArrowLeft?: () => void;
    onArrowRight?: () => void;
    onPageUp?: () => void;
    onPageDown?: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            // Escape works even while an input is focused (close the overlay you're typing in)
            if (e.key === 'Escape') { handlers.onEscape(); return; }
            if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;

            if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handlers.onEdit(); }
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handlers.onFullscreen(); }
            if (e.key === 's' || e.key === 'S') { e.preventDefault(); handlers.onCycleStrip(); }
            if (e.key === 'i' || e.key === 'I') { e.preventDefault(); handlers.onToggleView(); }
            if ((e.key === 'p' || e.key === 'P') && handlers.onTogglePlay) { e.preventDefault(); handlers.onTogglePlay(); }
            if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); handlers.onToggleQuote(); }
            if (e.key === '?' || e.key === '/') { e.preventDefault(); handlers.onToggleHints(); }
            if (e.key === 'ArrowLeft' && handlers.onArrowLeft) { e.preventDefault(); handlers.onArrowLeft(); }
            if (e.key === 'ArrowRight' && handlers.onArrowRight) { e.preventDefault(); handlers.onArrowRight(); }
            if (e.key === 'PageUp' && handlers.onPageUp) { e.preventDefault(); handlers.onPageUp(); }
            if (e.key === 'PageDown' && handlers.onPageDown) { e.preventDefault(); handlers.onPageDown(); }
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
        handlers.onTogglePlay,
        handlers.onToggleQuote,
        handlers.onToggleHints,
        handlers.onEscape,
        handlers.onArrowLeft,
        handlers.onArrowRight,
        handlers.onPageUp,
        handlers.onPageDown,
    ]);
}
