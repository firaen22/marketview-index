import { useEffect, useRef } from 'react';

/**
 * Holds a Screen Wake Lock sentinel while `enabled` is true.
 * Silently no-ops when the API is missing or the request is denied.
 */
export function useWakeLock(enabled: boolean): void {
    const sentinelRef = useRef<WakeLockSentinel | null>(null);
    const pendingRef = useRef(false);
    // Set on cleanup so a request still in flight never stores a lock
    // after the component is gone — that lock would outlive every owner.
    const cancelledRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        // navigator.wakeLock may be undefined (Firefox, older Safari) and
        // document may be undefined in SSR — guard before touching either.
        if (typeof document === 'undefined') return;
        if (!navigator.wakeLock?.request) return;

        cancelledRef.current = false;

        async function acquire() {
            // At most one in-flight request at a time.
            if (pendingRef.current || sentinelRef.current) return;
            pendingRef.current = true;
            try {
                const lock = await navigator.wakeLock!.request('screen');
                if (cancelledRef.current) {
                    lock.release().catch(() => {});
                    return;
                }
                sentinelRef.current = lock;
                lock.addEventListener('release', () => {
                    sentinelRef.current = null;
                });
            } catch {
                // NotAllowedError (insecure context, permission denied), AbortError, etc.
                // All tolerated — the projector still works without the lock.
            } finally {
                pendingRef.current = false;
            }
        }

        function onVisibilityChange() {
            if (document.visibilityState === 'visible') {
                acquire();
            }
        }

        document.addEventListener('visibilitychange', onVisibilityChange);
        acquire();

        return () => {
            cancelledRef.current = true;
            document.removeEventListener('visibilitychange', onVisibilityChange);
            sentinelRef.current?.release().catch(() => {});
            sentinelRef.current = null;
        };
    }, [enabled]);
}
