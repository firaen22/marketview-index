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
        const byteSize = new Blob([target.content]).size;
        if (byteSize > MAX_CONTENT_BYTES) {
            // A pending idle-reset from a prior 'ok' must not wipe this 'error'
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
                statusTimerRef.current = null;
            }
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
        saveRemoteSlide(target).then(() => {
            if (!mountedRef.current) return;
            setCloudStatus('ok');
            setLastSavedAt(Date.now());
            statusTimerRef.current = window.setTimeout(() => setCloudStatus('idle'), 2000);
        }).catch((e) => {
            if (!mountedRef.current) return;
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
