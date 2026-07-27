import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Non-blocking transient message.
 *
 * Replaces `alert()` on the presenter's phone: a modal alert freezes the remote
 * control mid-presentation and has to be dismissed by hand before anything else
 * works. This does not steal focus, does not block input, and clears itself.
 *
 * Deliberately a local hook rather than an app-wide provider — there is exactly
 * one caller. Ownership and lifetime are therefore unambiguous: the component
 * that calls useToast owns it, and unmounting cancels the pending timer.
 */

const TOAST_MS = 4000;

export function useToast() {
    const [message, setMessage] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // Single instance: a new message restarts the timer rather than queueing.
    const showToast = useCallback((next: string) => {
        clear();
        setMessage(next);
        timerRef.current = setTimeout(() => {
            setMessage(null);
            timerRef.current = null;
        }, TOAST_MS);
    }, [clear]);

    useEffect(() => clear, [clear]);

    return { message, showToast };
}

export function Toast({ message }: { message: string | null }) {
    if (message === null) return null;
    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none"
        >
            <div className="max-w-md rounded-lg border border-zinc-700 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-100 shadow-xl">
                {message}
            </div>
        </div>
    );
}
