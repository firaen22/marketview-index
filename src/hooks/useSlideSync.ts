import { useEffect, useRef, useState } from 'react';
import {
    getSettings,
    setSetting,
    type PresentSlide,
} from '../settings';
import {
    isValidPresentSlide,
    loadRemoteSlide,
    saveRemoteSlide,
    StaleSaveError,
    MAX_CONTENT_BYTES,
} from '../slideApi';

const SAVE_DEBOUNCE_MS = 800;

export type CloudStatus = 'idle' | 'saving' | 'ok' | 'error';

export interface UseSlideSyncResult {
    slide: PresentSlide;
    saveSlide: (next: Partial<PresentSlide>) => void;
    doRemoteSave: (s?: PresentSlide) => void;
    cloudStatus: CloudStatus;
    lastSavedAt: number | null;
    sizeWarning: string | null;
}

export function useSlideSync(): UseSlideSyncResult {
    const [slide, setSlide] = useState<PresentSlide>(() => getSettings().presentSlide);
    const [cloudStatus, setCloudStatus] = useState<CloudStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [sizeWarning, setSizeWarning] = useState<string | null>(null);
    const [, setTick] = useState(0);
    const saveTimerRef = useRef<number | null>(null);
    const statusTimerRef = useRef<number | null>(null);
    // Bumped when an oversize edit takes over the status indicator, so a save
    // dispatched before it cannot resolve later and overwrite 'error' with 'ok'
    // — which also stamped lastSavedAt and decayed to idle, telling the
    // presenter the deck had saved while the "Not synced to cloud" box was up.
    const saveEpochRef = useRef(0);
    const slideRef = useRef(slide);
    slideRef.current = slide;
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Periodic tick to keep "saved Ns ago" label fresh
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 15000);
        return () => clearInterval(id);
    }, []);

    // Load remote slide on mount (overrides local if newer)
    useEffect(() => {
        loadRemoteSlide().then(remote => {
            if (remote && remote.updatedAt > slideRef.current.updatedAt) {
                setSlide(remote);
                setSetting('presentSlide', remote);
            }
        });
    }, []);

    // Cross-tab localStorage sync
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === 'marketflow_settings' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (isValidPresentSlide(parsed?.presentSlide)) setSlide(parsed.presentSlide);
                } catch {}
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // Cleanup save debounce timer on unmount
    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    }, []);

    const doRemoteSave = (s?: PresentSlide) => {
        const target = s ?? slideRef.current;
        // A slide nobody has edited on this device still carries DEFAULT_SLIDE's
        // updatedAt of 0 — and loadRemoteSlide() returns null on ANY failure, so a
        // failed mount load leaves it at 0 for good. Posting that hits the server's
        // legacy branch (api/present-slide.ts: `hasClientUpdatedAt` needs > 0), which
        // skips the read, the staleness check AND the CAS, then stamps Date.now() —
        // replacing the live deck with the placeholder and winning every later
        // reconcile. A Save press here means "the deck never loaded", not "save this".
        // The condition mirrors the server's `hasClientUpdatedAt` exactly: both
        // validators accept any finite number, so a negative timestamp from corrupt
        // or hand-edited storage also lands on that legacy branch.
        if (!Number.isFinite(target.updatedAt) || target.updatedAt <= 0) {
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
                statusTimerRef.current = null;
            }
            saveEpochRef.current += 1;
            setSizeWarning('Slide has not loaded yet — nothing to save. Reload the page first.');
            setCloudStatus('error');
            return;
        }
        const byteSize = new Blob([target.content]).size;
        if (byteSize > MAX_CONTENT_BYTES) {
            // A pending idle-reset from a prior 'ok' must not wipe this 'error'
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
                statusTimerRef.current = null;
            }
            saveEpochRef.current += 1;
            setSizeWarning(`Content is ${(byteSize / 1024).toFixed(0)} KB — max ${MAX_CONTENT_BYTES / 1024} KB. Not synced to cloud.`);
            setCloudStatus('error');
            return;
        }
        setSizeWarning(null);
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }
        setCloudStatus('saving');
        const epoch = saveEpochRef.current;
        saveRemoteSlide(target).then(() => {
            if (!mountedRef.current || saveEpochRef.current !== epoch) return;
            setCloudStatus('ok');
            setLastSavedAt(Date.now());
            statusTimerRef.current = window.setTimeout(() => setCloudStatus('idle'), 2000);
        }).catch((e) => {
            // Epoch-guarded too: without it a save that fails for an unrelated
            // reason after an oversize edit sets its own 'error' + 3s decay to
            // idle, destroying the oversize state by a different route.
            if (!mountedRef.current || saveEpochRef.current !== epoch) return;
            // Superseded by a newer local save — that save drives UI state.
            // A server 409 has no follow-up save, so reset the indicator ourselves.
            if (e instanceof StaleSaveError) {
                if (e.remote) setCloudStatus('idle');
                return;
            }
            setCloudStatus('error');
            statusTimerRef.current = window.setTimeout(() => setCloudStatus('idle'), 3000);
        });
    };

    const saveSlide = (next: Partial<PresentSlide>) => {
        const merged: PresentSlide = { ...slideRef.current, ...next, updatedAt: Date.now() };
        setSlide(merged);
        setSetting('presentSlide', merged);

        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }
        const byteSize = new Blob([merged.content]).size;
        if (byteSize > MAX_CONTENT_BYTES) {
            if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
            saveEpochRef.current += 1;
            setSizeWarning(`Content is ${(byteSize / 1024).toFixed(0)} KB — max ${MAX_CONTENT_BYTES / 1024} KB. Not synced to cloud.`);
            setCloudStatus('error');
            return;
        }
        setSizeWarning(null);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setCloudStatus('saving');
        saveTimerRef.current = window.setTimeout(() => {
            doRemoteSave(merged);
        }, SAVE_DEBOUNCE_MS);
    };

    return {
        slide,
        saveSlide,
        doRemoteSave,
        cloudStatus,
        lastSavedAt,
        sizeWarning,
    };
}
